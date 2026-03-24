import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Animated,
  Pressable,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../utils/theme';
import { useTheme } from '../utils/useTheme';
import { useAppStore } from '../store/useAppStore';
import { CategoryBadge } from '../components/ui/Badge';
import { SearchBar } from '../components/ui/SearchBar';
import { FilterChipRow } from '../components/ui/FilterChip';
import { EmptyState } from '../components/ui/EmptyState';
import { Document, FilterCategory } from '../types';
import { getFilteredDocumentsPage, deleteDocument, getAllFilteredDocuments } from '../database/documents';
import { formatBytes } from '../utils/format';
import { CategoryLabels } from '../utils/theme';
import { getFileTypeUI } from '../utils/fileTypes';
import { exportDocumentsCsv } from '../utils/exportCsv';

const PAGE_SIZE = 20;

const CATEGORY_CHIPS = [
  { key: 'all', label: 'Todo' },
  { key: 'invoice', label: 'Facturas' },
  { key: 'receipt', label: 'Recibos' },
  { key: 'statement', label: 'Estados' },
  { key: 'contract', label: 'Contratos' },
  { key: 'tax', label: 'Impuestos' },
  { key: 'insurance', label: 'Seguros' },
  { key: 'medical', label: 'Médico' },
  { key: 'other', label: 'Otro' },
];

const FILE_TYPE_CHIPS = [
  { key: 'all', label: 'Todos' },
  { key: 'pdf', label: 'PDF' },
  { key: 'images', label: 'Imágenes' },
  { key: 'word', label: 'Word' },
  { key: 'excel', label: 'Excel' },
  { key: 'xml', label: 'XML' },
];

export default function RepositoryScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { filters, setFilter, resetFilters, documents, setDocuments, removeDocument, syncState } = useAppStore();
  const insets = useSafeAreaInsets();
  const [searchFocused, setSearchFocused] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // Batch selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportingCsv, setExportingCsv] = useState(false);

  // File availability map: docId -> boolean
  const [fileAvailability, setFileAvailability] = useState<Record<string, boolean>>({});

  const activeFilterCount = [
    filters.fileType !== 'all',
    filters.dateRange !== 'all',
    filters.starredOnly,
    filters.provider !== 'all',
  ].filter(Boolean).length;

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offsetRef = useRef(0);
  const docsRef = useRef<Document[]>([]);
  docsRef.current = documents;

  // Reload documents automatically when any sync finishes
  const wasSyncingRef = useRef(false);
  useEffect(() => {
    const isSyncingNow = Object.values(syncState).some((s) => s?.isSyncing);
    if (wasSyncingRef.current && !isSyncingNow) {
      // Sync just completed — refresh the list
      offsetRef.current = 0;
      loadDocuments(true);
    }
    wasSyncingRef.current = isSyncingNow;
  }, [syncState]);

  const checkFileAvailability = useCallback(async (docs: Document[]) => {
    if (docs.length === 0) return;
    // Process in batches of 100 to avoid overwhelming the filesystem
    const BATCH = 100;
    for (let i = 0; i < docs.length; i += BATCH) {
      const batch = docs.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (d) => {
          try {
            const info = await FileSystem.getInfoAsync(d.filePath);
            return { id: d.id, exists: info.exists };
          } catch {
            return { id: d.id, exists: false };
          }
        })
      );
      const map: Record<string, boolean> = {};
      results.forEach((r) => { map[r.id] = r.exists; });
      setFileAvailability((prev) => ({ ...prev, ...map }));
    }
  }, []);

  const loadDocuments = useCallback(async (reset = true) => {
    const offset = reset ? 0 : offsetRef.current;
    const page = await getFilteredDocumentsPage(filters, offset, PAGE_SIZE);
    if (reset) {
      setDocuments(page);
      offsetRef.current = page.length;
      // Check availability for first batch
      checkFileAvailability(page);
    } else {
      const existingIds = new Set(docsRef.current.map((d) => d.id));
      const newItems = page.filter((d) => !existingIds.has(d.id));
      setDocuments([...docsRef.current, ...newItems]);
      offsetRef.current = offset + page.length;
      checkFileAvailability(newItems);
    }
    setHasMore(page.length === PAGE_SIZE);
  }, [filters, checkFileAvailability]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await loadDocuments(false);
    setLoadingMore(false);
  }, [loadingMore, hasMore, loadDocuments]);

  const groupedDocuments = useMemo(() => {
    const groups: Record<string, Document[]> = {};
    documents.forEach((doc) => {
      const year = format(doc.emailDate, 'yyyy');
      const month = format(doc.emailDate, 'LLLL', { locale: es });
      const key = `${month.charAt(0).toUpperCase() + month.slice(1)} ${year}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(doc);
    });
    return Object.entries(groups).map(([title, data]) => ({ title, data }));
  }, [documents]);

  useFocusEffect(
    useCallback(() => {
      setSelectionMode(false);
      setSelectedIds(new Set());
      offsetRef.current = 0;
      loadDocuments(true);
    }, [filters.category, filters.provider, filters.fileType, filters.dateRange, filters.starredOnly, filters.sortBy, filters.searchQuery])
  );

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (filters.searchQuery.length === 0 || filters.searchQuery.length >= 2) {
      searchTimeout.current = setTimeout(() => {
        offsetRef.current = 0;
        loadDocuments(true);
      }, 300);
    }
  }, [filters.searchQuery]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setSelectionMode(false);
    setSelectedIds(new Set());
    offsetRef.current = 0;
    await loadDocuments(true);
    setRefreshing(false);
  }, [filters]);

  // --- Selection helpers ---
  const enterSelection = useCallback((docId: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([docId]));
  }, []);

  const toggleSelection = useCallback((docId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(documents.map((d) => d.id)));
  }, [documents]);

  const handleDeleteSelected = useCallback(() => {
    const count = selectedIds.size;
    if (count === 0) return;
    Alert.alert(
      'Eliminar seleccionados',
      `¿Eliminar ${count} documento${count !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const ids = Array.from(selectedIds);
            await Promise.all(ids.map((id) => deleteDocument(id)));
            ids.forEach((id) => removeDocument(id));
            exitSelection();
          },
        },
      ]
    );
  }, [selectedIds, removeDocument, exitSelection]);

  const handleExportSelected = useCallback(async () => {
    const selected = documents.filter((d) => selectedIds.has(d.id));
    if (selected.length === 0) return;
    setExportingCsv(true);
    try {
      await exportDocumentsCsv(selected, 'seleccionados_inboxdocs');
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo exportar: ' + (e?.message ?? ''));
    } finally {
      setExportingCsv(false);
    }
  }, [documents, selectedIds]);

  // Fetch ALL matching documents from the DB (not just the loaded page) before exporting
  const handleExportAll = useCallback(async () => {
    setExportingCsv(true);
    try {
      const allDocs = await getAllFilteredDocuments(filters);
      if (allDocs.length === 0) {
        Alert.alert('Sin documentos', 'No hay documentos que exportar con los filtros actuales.');
        return;
      }
      await exportDocumentsCsv(allDocs);
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo exportar: ' + (e?.message ?? ''));
    } finally {
      setExportingCsv(false);
    }
  }, [filters]);

  const renderItem = useCallback(({ item }: { item: Document }) => (
    <DocumentListItem
      doc={item}
      fileAvailable={fileAvailability[item.id]}
      selectionMode={selectionMode}
      isSelected={selectedIds.has(item.id)}
      onPress={() => {
        if (selectionMode) {
          toggleSelection(item.id);
        } else {
          navigation.navigate('DocumentDetail', { documentId: item.id });
        }
      }}
      onLongPress={() => {
        if (!selectionMode) enterSelection(item.id);
      }}
    />
  ), [selectionMode, selectedIds, fileAvailability, navigation, toggleSelection, enterSelection]);

  const renderGridItem = useCallback(({ item }: { item: Document }) => (
    <DocumentGridItem
      doc={item}
      fileAvailable={fileAvailability[item.id]}
      selectionMode={selectionMode}
      isSelected={selectedIds.has(item.id)}
      onPress={() => {
        if (selectionMode) {
          toggleSelection(item.id);
        } else {
          navigation.navigate('DocumentDetail', { documentId: item.id });
        }
      }}
      onLongPress={() => {
        if (!selectionMode) enterSelection(item.id);
      }}
    />
  ), [selectionMode, selectedIds, fileAvailability, navigation, toggleSelection, enterSelection]);

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      {/* Header */}
      {selectionMode ? (
        <View style={[styles.selectionHeader, { paddingTop: insets.top + Spacing.sm, backgroundColor: theme.primarySubtle, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={exitSelection} style={styles.selectionCloseBtn}>
            <Ionicons name="close" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.selectionCount, { color: theme.primary }]}>
            {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
          </Text>
          <TouchableOpacity onPress={selectAll} style={styles.selectAllBtn}>
            <Text style={[styles.selectAllText, { color: theme.primary }]}>Todos</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          {!searchFocused && <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Documentos</Text>}
          <View style={styles.searchContainer}>
            <SearchBar
              value={filters.searchQuery}
              onChangeText={(text) => setFilter('searchQuery', text)}
              onFocus={() => setSearchFocused(true)}
              onCancel={() => {
                setSearchFocused(false);
                setFilter('searchQuery', '');
              }}
              focused={searchFocused}
            />
          </View>
        </View>
      )}

      {/* Filter chips — hidden in selection mode */}
      {!selectionMode && (
        <View style={styles.filtersContainer}>
          <FilterChipRow
            chips={CATEGORY_CHIPS}
            selected={filters.category}
            onSelect={(key) => setFilter('category', key as FilterCategory)}
          />
        </View>
      )}

      {/* Sort + Count + Filter */}
      {!selectionMode && (
        <View style={styles.sortRow}>
          <Text style={[styles.countText, { color: theme.textMuted }]}>
            {documents.length} doc{documents.length !== 1 ? 's' : ''}{hasMore ? '+' : ''}
          </Text>
          <View style={styles.actionsRowRight}>
            <TouchableOpacity onPress={handleExportAll} style={styles.exportIconBtn} disabled={exportingCsv || documents.length === 0}>
              {exportingCsv
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <MaterialCommunityIcons name="export-variant" size={20} color={documents.length === 0 ? Colors.textMuted : Colors.primary} />
              }
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode(v => v === 'list' ? 'grid' : 'list')}
              style={styles.viewToggle}
            >
              <MaterialCommunityIcons
                name={viewMode === 'list' ? 'view-grid-outline' : 'view-list-outline'}
                size={22}
                color={Colors.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterModalVisible(true)}>
              <MaterialCommunityIcons name="tune-variant" size={18} color={activeFilterCount > 0 ? Colors.surface : Colors.primary} />
              <Text style={[styles.filterBtnText, activeFilterCount > 0 && { color: Colors.surface }]}>
                {activeFilterCount > 0 ? `Filtros (${activeFilterCount})` : 'Filtros'}
              </Text>
            </TouchableOpacity>
            <SortButton current={filters.sortBy} onChange={(sort) => setFilter('sortBy', sort as any)} />
          </View>
        </View>
      )}

      {/* List */}
      {viewMode === 'list' ? (
        <SectionList
          sections={groupedDocuments}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section: { title } }) => (
            <View style={[styles.sectionHeaderRow, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
              <Text style={[styles.sectionHeaderTitle, { color: theme.textPrimary }]}>{title}</Text>
              <Text style={[styles.sectionHeaderCount, { color: theme.textMuted, backgroundColor: theme.surface }]}>
                {groupedDocuments.find(g => g.title === title)?.data.length ?? 0}
              </Text>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="folder-search-outline"
              title="Sin resultados"
              subtitle={
                filters.searchQuery
                  ? `No hay documentos que coincidan con "${filters.searchQuery}"`
                  : 'No hay documentos en esta categoría'
              }
            />
          }
        />
      ) : (
        <FlatList
          data={documents}
          numColumns={2}
          keyExtractor={(item) => item.id}
          renderItem={renderGridItem}
          columnWrapperStyle={styles.gridColumnWrapper}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="folder-search-outline"
              title="Sin resultados"
              subtitle={
                filters.searchQuery
                  ? `No hay documentos que coincidan con "${filters.searchQuery}"`
                  : 'No hay documentos en esta categoría'
              }
            />
          }
        />
      )}

      {/* Batch action bar (shown when in selection mode) */}
      {selectionMode && (
        <View style={[styles.batchBar, { paddingBottom: insets.bottom + Spacing.sm, backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.batchAction, selectedIds.size === 0 && styles.batchActionDisabled]}
            onPress={handleExportSelected}
            disabled={selectedIds.size === 0 || exportingCsv}
          >
            {exportingCsv
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <MaterialCommunityIcons name="export-variant" size={22} color={Colors.primary} />
            }
            <Text style={[styles.batchActionText, { color: theme.primary }]}>Exportar CSV</Text>
          </TouchableOpacity>

          <View style={[styles.batchDivider, { backgroundColor: theme.border }]} />

          <TouchableOpacity
            style={[styles.batchAction, styles.batchActionDanger, selectedIds.size === 0 && styles.batchActionDisabled]}
            onPress={handleDeleteSelected}
            disabled={selectedIds.size === 0}
          >
            <MaterialCommunityIcons name="delete-outline" size={22} color={Colors.danger} />
            <Text style={[styles.batchActionText, { color: Colors.danger }]}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter Modal */}
      <Modal visible={filterModalVisible} transparent animationType="slide">
        <View style={styles.filterOverlay}>
          <View style={[styles.filterSheet, { backgroundColor: theme.surface }]}>
            <View style={[styles.filterSheetHandle, { backgroundColor: theme.border }]} />
            <View style={styles.filterSheetHeader}>
              <Text style={[styles.filterSheetTitle, { color: theme.textPrimary }]}>Filtros</Text>
              <TouchableOpacity onPress={() => { resetFilters(); }}>
                <Text style={[styles.filterReset, { color: theme.primary }]}>Limpiar</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.filterGroupLabel, { color: theme.textMuted }]}>TIPO DE ARCHIVO</Text>
            <View style={styles.filterChipGrid}>
              {FILE_TYPE_CHIPS.map((chip) => (
                <TouchableOpacity
                  key={chip.key}
                  style={[styles.filterChip, { borderColor: theme.border, backgroundColor: theme.surface }, filters.fileType === chip.key && styles.filterChipActive]}
                  onPress={() => setFilter('fileType', chip.key as any)}
                >
                  <Text style={[styles.filterChipText, { color: theme.textPrimary }, filters.fileType === chip.key && styles.filterChipTextActive]}>
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.filterGroupLabel, { color: theme.textMuted }]}>PERÍODO</Text>
            <View style={styles.filterChipGrid}>
              {[
                { key: 'all', label: 'Todos' },
                { key: '7d', label: 'Última semana' },
                { key: '30d', label: 'Último mes' },
                { key: '90d', label: 'Últimos 3 meses' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterChip, { borderColor: theme.border, backgroundColor: theme.surface }, filters.dateRange === opt.key && styles.filterChipActive]}
                  onPress={() => setFilter('dateRange', opt.key as any)}
                >
                  <Text style={[styles.filterChipText, { color: theme.textPrimary }, filters.dateRange === opt.key && styles.filterChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.filterGroupLabel, { color: theme.textMuted }]}>OTROS</Text>
            <TouchableOpacity
              style={[styles.filterChip, { borderColor: theme.border, backgroundColor: theme.surface }, filters.starredOnly && styles.filterChipActive]}
              onPress={() => setFilter('starredOnly', !filters.starredOnly)}
            >
              <Text style={[styles.filterChipText, { color: theme.textPrimary }, filters.starredOnly && styles.filterChipTextActive]}>
                ⭐ Solo destacados
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.filterApplyBtn} onPress={() => setFilterModalVisible(false)}>
              <Text style={styles.filterApplyText}>Aplicar filtros</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── DocumentListItem ──────────────────────────────────────────────────────
type ListItemProps = {
  doc: Document;
  fileAvailable: boolean | undefined;
  selectionMode: boolean;
  isSelected: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

function DocumentListItem({ doc, fileAvailable, selectionMode, isSelected, onPress, onLongPress }: ListItemProps) {
  const theme = useTheme();
  const ext = doc.fileExtension.toUpperCase();
  const ui = getFileTypeUI(doc.fileExtension);
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30, bounciness: 4 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
  };

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} onPressIn={onPressIn} onPressOut={onPressOut} delayLongPress={400}>
      <Animated.View style={[
        styles.docCard,
        { transform: [{ scale }], backgroundColor: theme.surface },
        isSelected && styles.docCardSelected,
      ]}>
        {/* Colored left accent bar */}
        <View style={[styles.docAccentBar, { backgroundColor: ui.color }]} />

        {/* Selection checkbox */}
        {selectionMode && (
          <View style={[styles.checkbox, { backgroundColor: theme.surface, borderColor: theme.textMuted }, isSelected && styles.checkboxSelected]}>
            {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        )}

        <View style={[styles.docIcon, { backgroundColor: ui.bgColor }]}>
          <MaterialCommunityIcons name={ui.icon as any} size={26} color={ui.color} />
          <Text style={[styles.docExtBadge, { color: ui.color }]}>{ext}</Text>
        </View>
        <View style={styles.docInfo}>
          <View style={styles.docTopRow}>
            <Text style={[styles.docName, { color: theme.textPrimary }]} numberOfLines={1}>
              {doc.originalFilename}
            </Text>
            {doc.isStarred && (
              <Ionicons name="star" size={14} color={Colors.warning} />
            )}
            {/* File availability dot */}
            {fileAvailable !== undefined && (
              <View style={[
                styles.availabilityDot,
                { backgroundColor: fileAvailable ? Colors.success : '#F97316' }
              ]} />
            )}
          </View>
          <Text style={[styles.docMeta, { color: theme.textMuted }]} numberOfLines={1}>
            {doc.senderName ?? doc.senderEmail} · {format(doc.emailDate, 'dd MMM yyyy', { locale: es })}
          </Text>
          <View style={styles.docBottomRow}>
            <CategoryBadge category={doc.category} size="sm" />
            <View style={styles.docBadgeRow}>
              {doc.notes ? (
                <View style={[styles.docNoteBadge, { backgroundColor: theme.primarySubtle }]}>
                  <MaterialCommunityIcons name="note-text-outline" size={11} color={theme.primary} />
                </View>
              ) : null}
              {doc.isStarred ? (
                <View style={styles.docStarBadge}>
                  <Ionicons name="star" size={11} color={Colors.warning} />
                </View>
              ) : null}
              <Text style={[styles.docSize, { color: theme.textMuted }]}>{formatBytes(doc.fileSize)}</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── SortButton ────────────────────────────────────────────────────────────
function SortButton({ current, onChange }: { current: string; onChange: (v: string) => void }) {
  const theme = useTheme();
  const options = [
    { key: 'date_desc', label: 'Más reciente' },
    { key: 'date_asc', label: 'Más antiguo' },
    { key: 'name_asc', label: 'Nombre A-Z' },
    { key: 'size_desc', label: 'Mayor tamaño' },
  ];
  const currentLabel = options.find((o) => o.key === current)?.label ?? 'Más reciente';
  const [open, setOpen] = useState(false);

  return (
    <View>
      <TouchableOpacity style={styles.sortBtn} onPress={() => setOpen(!open)}>
        <Text style={[styles.sortBtnText, { color: theme.primary }]}>{currentLabel}</Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={theme.primary} />
      </TouchableOpacity>
      {open && (
        <View style={[styles.sortDropdown, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={styles.sortOption}
              onPress={() => { onChange(opt.key); setOpen(false); }}
            >
              <Text style={[styles.sortOptionText, { color: theme.textPrimary }, current === opt.key && styles.sortOptionActive]}>
                {opt.label}
              </Text>
              {current === opt.key && (
                <Ionicons name="checkmark" size={14} color={theme.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── DocumentGridItem ──────────────────────────────────────────────────────
type GridItemProps = {
  doc: Document;
  fileAvailable: boolean | undefined;
  selectionMode: boolean;
  isSelected: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

function DocumentGridItem({ doc, fileAvailable, selectionMode, isSelected, onPress, onLongPress }: GridItemProps) {
  const theme = useTheme();
  const isImage = ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(doc.fileExtension);
  const ext = doc.fileExtension.toUpperCase();
  const ui = getFileTypeUI(doc.fileExtension);
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 30, bounciness: 4 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
  };

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} onPressIn={onPressIn} onPressOut={onPressOut} style={{ width: '48%' }} delayLongPress={400}>
      <Animated.View style={[
        styles.gridCard,
        { transform: [{ scale }], backgroundColor: theme.surface },
        isSelected && styles.docCardSelected,
      ]}>
        <View style={[styles.gridAccentBar, { backgroundColor: ui.color }]} />
        <View style={[styles.gridPreviewArea, !isImage && { backgroundColor: ui.bgColor }]}>
          {isImage ? (
            <Image source={{ uri: doc.filePath }} style={styles.gridImage} contentFit="cover" />
          ) : (
            <View style={styles.gridIconFallback}>
              <MaterialCommunityIcons name={ui.icon as any} size={36} color={ui.color} />
              <Text style={[styles.gridExtBadge, { color: ui.color }]}>{ext}</Text>
            </View>
          )}
          {doc.isStarred && (
            <View style={[styles.gridStarBadge, { backgroundColor: theme.surface }]}>
              <Ionicons name="star" size={14} color={Colors.warning} />
            </View>
          )}
          {/* Selection checkbox for grid */}
          {selectionMode && (
            <View style={[styles.gridCheckbox, { borderColor: theme.textMuted }, isSelected && styles.checkboxSelected]}>
              {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
            </View>
          )}
          {/* File availability dot for grid */}
          {fileAvailable !== undefined && (
            <View style={[styles.gridAvailabilityDot, { backgroundColor: fileAvailable ? Colors.success : '#F97316', borderColor: theme.surface }]} />
          )}
        </View>
        <View style={styles.gridInfoArea}>
          <Text style={[styles.gridDocName, { color: theme.textPrimary }]} numberOfLines={2}>{doc.originalFilename}</Text>
          <Text style={[styles.gridDocDate, { color: theme.textMuted }]}>{format(doc.emailDate, 'dd MMM yyyy', { locale: es })}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
  },
  headerTitle: { ...Typography.headingL, color: Colors.textPrimary },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.primarySubtle,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  selectionCloseBtn: { padding: Spacing.sm },
  selectionCount: { ...Typography.bodyL, fontWeight: '700', color: Colors.primary, flex: 1 },
  selectAllBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  selectAllText: { ...Typography.bodyM, color: Colors.primary, fontWeight: '600' },
  searchContainer: { flex: 1 },
  filtersContainer: { paddingBottom: Spacing.sm },
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  countText: { ...Typography.bodyM, color: Colors.textMuted },
  actionsRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  exportIconBtn: { padding: Spacing.xs },
  viewToggle: { padding: Spacing.xs },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sortBtnText: { ...Typography.bodyM, color: Colors.primary, fontWeight: '500' },
  sortDropdown: {
    position: 'absolute',
    right: 0,
    top: 28,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.medium,
    zIndex: 100,
    minWidth: 160,
    paddingVertical: Spacing.xs,
  },
  sortOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  sortOptionText: { ...Typography.bodyM, color: Colors.textPrimary },
  sortOptionActive: { color: Colors.primary, fontWeight: '600' },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.sm,
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.card,
    paddingVertical: Spacing.md,
    paddingLeft: Spacing.xl,
    paddingRight: Spacing.md,
    gap: Spacing.md,
    overflow: 'hidden',
    ...Shadows.subtle,
  },
  docCardSelected: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  docAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: BorderRadius.card,
    borderBottomLeftRadius: BorderRadius.card,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  checkboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  docIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: Colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docExtBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    fontSize: 8,
    fontWeight: '700',
    color: Colors.primary,
  },
  docInfo: { flex: 1, gap: 4 },
  docTopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  docName: { ...Typography.bodyM, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  availabilityDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  docMeta: { ...Typography.caption, color: Colors.textMuted },
  docBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  docSize: { ...Typography.caption, color: Colors.textMuted },
  docBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  docNoteBadge: { backgroundColor: Colors.primarySubtle, borderRadius: 4, padding: 2 },
  docStarBadge: { backgroundColor: '#FEF3C7', borderRadius: 4, padding: 2 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionHeaderTitle: {
    ...Typography.headingS,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  sectionHeaderCount: {
    ...Typography.caption,
    color: Colors.textMuted,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  loadingMore: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  gridContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.md,
  },
  gridColumnWrapper: {
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  gridCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.card,
    padding: Spacing.sm,
    overflow: 'hidden',
    ...Shadows.subtle,
  },
  gridAccentBar: {
    height: 4,
    width: '100%',
    borderTopLeftRadius: BorderRadius.card,
    borderTopRightRadius: BorderRadius.card,
    marginBottom: Spacing.xs,
  },
  gridPreviewArea: {
    height: 120,
    backgroundColor: Colors.primarySubtle,
    borderRadius: BorderRadius.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  gridImage: { width: '100%', height: '100%' },
  gridIconFallback: { alignItems: 'center', justifyContent: 'center' },
  gridExtBadge: {
    position: 'absolute',
    bottom: -10,
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  gridStarBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 2,
    ...Shadows.subtle,
  },
  gridCheckbox: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridAvailabilityDot: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  gridInfoArea: { gap: 2 },
  gridDocName: { ...Typography.bodyM, fontWeight: '600', color: Colors.textPrimary },
  gridDocDate: { ...Typography.caption, color: Colors.textMuted },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
  },
  filterBtnText: { fontSize: 12, fontWeight: '600', color: Colors.surface },
  filterOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  filterSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.xl, paddingBottom: Spacing.xxxl, gap: Spacing.md },
  filterSheetHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.sm },
  filterSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filterSheetTitle: { ...Typography.headingM, color: Colors.textPrimary },
  filterReset: { ...Typography.bodyM, color: Colors.primary },
  filterGroupLabel: { ...Typography.caption, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5, marginTop: Spacing.sm },
  filterChipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.pill, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { ...Typography.bodyM, color: Colors.textPrimary },
  filterChipTextActive: { color: Colors.surface, fontWeight: '600' },
  filterApplyBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.input, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  filterApplyText: { ...Typography.bodyM, color: Colors.surface, fontWeight: '600' },
  // Batch action bar
  batchBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    ...Shadows.large,
  },
  batchAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  batchActionDanger: {},
  batchActionDisabled: { opacity: 0.4 },
  batchActionText: { ...Typography.caption, color: Colors.primary, fontWeight: '600' },
  batchDivider: { width: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },
});
