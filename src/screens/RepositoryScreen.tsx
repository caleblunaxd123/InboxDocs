import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../utils/theme';
import { useAppStore } from '../store/useAppStore';
import { CategoryBadge } from '../components/ui/Badge';
import { SearchBar } from '../components/ui/SearchBar';
import { FilterChipRow } from '../components/ui/FilterChip';
import { EmptyState } from '../components/ui/EmptyState';
import { Document, FilterCategory } from '../types';
import { getFilteredDocuments } from '../database/documents';
import { formatBytes } from '../utils/format';
import { CategoryLabels } from '../utils/theme';

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

export default function RepositoryScreen() {
  const navigation = useNavigation<any>();
  const { filters, setFilter, documents, setDocuments } = useAppStore();
  const [searchFocused, setSearchFocused] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDocuments = useCallback(async () => {
    const docs = await getFilteredDocuments(filters);
    setDocuments(docs);
  }, [filters]);

  useEffect(() => {
    loadDocuments();
  }, [filters.category, filters.provider, filters.fileType, filters.dateRange, filters.starredOnly, filters.sortBy]);

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (filters.searchQuery.length === 0 || filters.searchQuery.length >= 2) {
      searchTimeout.current = setTimeout(loadDocuments, 300);
    }
  }, [filters.searchQuery]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDocuments();
    setRefreshing(false);
  }, [loadDocuments]);

  const renderItem = useCallback(({ item }: { item: Document }) => (
    <DocumentListItem
      doc={item}
      onPress={() => navigation.navigate('DocumentDetail', { documentId: item.id })}
    />
  ), []);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        {!searchFocused && <Text style={styles.headerTitle}>Documentos</Text>}
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

      {/* Filter chips */}
      <View style={styles.filtersContainer}>
        <FilterChipRow
          chips={CATEGORY_CHIPS}
          selected={filters.category}
          onSelect={(key) => setFilter('category', key as FilterCategory)}
        />
      </View>

      {/* Sort + Count */}
      <View style={styles.sortRow}>
        <Text style={styles.countText}>{documents.length} documento{documents.length !== 1 ? 's' : ''}</Text>
        <SortButton
          current={filters.sortBy}
          onChange={(sort) => setFilter('sortBy', sort as any)}
        />
      </View>

      {/* List */}
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
        getItemLayout={(_, index) => ({ length: 88, offset: 88 * index, index })}
      />
    </SafeAreaView>
  );
}

function DocumentListItem({ doc, onPress }: { doc: Document; onPress: () => void }) {
  const ext = doc.fileExtension.toUpperCase();
  return (
    <TouchableOpacity style={styles.docCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.docIcon}>
        <MaterialCommunityIcons name="file-document-outline" size={26} color={Colors.primary} />
        <Text style={styles.docExtBadge}>{ext}</Text>
      </View>
      <View style={styles.docInfo}>
        <View style={styles.docTopRow}>
          <Text style={styles.docName} numberOfLines={1}>
            {doc.originalFilename}
          </Text>
          {doc.isStarred && (
            <Ionicons name="star" size={14} color={Colors.warning} />
          )}
        </View>
        <Text style={styles.docMeta} numberOfLines={1}>
          {doc.senderName ?? doc.senderEmail} · {format(doc.emailDate, 'dd MMM yyyy', { locale: es })}
        </Text>
        <View style={styles.docBottomRow}>
          <CategoryBadge category={doc.category} size="sm" />
          <Text style={styles.docSize}>{formatBytes(doc.fileSize)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function SortButton({ current, onChange }: { current: string; onChange: (v: string) => void }) {
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
        <Text style={styles.sortBtnText}>{currentLabel}</Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={Colors.primary} />
      </TouchableOpacity>
      {open && (
        <View style={styles.sortDropdown}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={styles.sortOption}
              onPress={() => {
                onChange(opt.key);
                setOpen(false);
              }}
            >
              <Text style={[styles.sortOptionText, current === opt.key && styles.sortOptionActive]}>
                {opt.label}
              </Text>
              {current === opt.key && (
                <Ionicons name="checkmark" size={14} color={Colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
  },
  headerTitle: { ...Typography.headingL, color: Colors.textPrimary },
  searchContainer: { flex: 1 },
  filtersContainer: { paddingVertical: Spacing.sm },
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  countText: { ...Typography.bodyM, color: Colors.textMuted },
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
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  sortOptionText: { ...Typography.bodyM, color: Colors.textPrimary },
  sortOptionActive: { color: Colors.primary, fontWeight: '600' },
  listContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.sm,
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.md,
    ...Shadows.subtle,
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
  docMeta: { ...Typography.caption, color: Colors.textMuted },
  docBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  docSize: { ...Typography.caption, color: Colors.textMuted },
});
