import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Spacing, Typography, BorderRadius, Shadows } from '../utils/theme';
import { useTheme } from '../utils/useTheme';
import { useAppStore } from '../store/useAppStore';
import { EmailPreview, AttachmentPreview, Account } from '../types';
import { previewGmailEmails, previewOutlookEmails } from '../services/emailPreviewService';
import { downloadSelectedAttachments } from '../services/selectiveDownloadService';
import { formatBytes } from '../utils/format';
import { getFileTypeUI } from '../utils/fileTypes';

type SelectionMap = Record<string, Set<string>>; // messageId -> Set<attachmentId>

const DATE_PRESETS = [
  { label: 'Última semana', days: 7 },
  { label: 'Últimos 30 días', days: 30 },
  { label: 'Últimos 3 meses', days: 90 },
  { label: 'Últimos 6 meses', days: 180 },
  { label: 'Último año', days: 365 },
];

export default function InboxScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { accounts } = useAppStore();

  // State
  const [emails, setEmails] = useState<EmailPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0, filename: '' });
  const [scanned, setScanned] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(
    accounts.length > 0 ? accounts[0] : null,
  );
  const [fromDate, setFromDate] = useState<Date>(subDays(new Date(), 30));
  const [toDate] = useState<Date>(new Date());
  const [showDateModal, setShowDateModal] = useState(false);
  const [selections, setSelections] = useState<SelectionMap>({});
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());
  const [filterExt, setFilterExt] = useState<string>('all');
  const [activeDatePreset, setActiveDatePreset] = useState(30);

  const activeAccounts = accounts.filter((a: Account) => a.isActive);

  // Count selected attachments
  const totalSelected = Object.values(selections).reduce((sum, s) => sum + s.size, 0);

  // Toggle email expansion
  const toggleExpand = (emailId: string) => {
    setExpandedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) next.delete(emailId);
      else next.add(emailId);
      return next;
    });
  };

  // Toggle single attachment selection
  const toggleAttachment = (emailId: string, attId: string) => {
    setSelections((prev) => {
      const next = { ...prev };
      const set = new Set(next[emailId] ?? []);
      if (set.has(attId)) set.delete(attId);
      else set.add(attId);
      if (set.size === 0) delete next[emailId];
      else next[emailId] = set;
      return next;
    });
  };

  // Toggle all attachments in an email
  const toggleEmailAll = (email: EmailPreview) => {
    setSelections((prev) => {
      const next = { ...prev };
      const current = next[email.id];
      const allSelected = current && current.size === email.attachments.length;
      if (allSelected) {
        delete next[email.id];
      } else {
        next[email.id] = new Set(email.attachments.map((a: AttachmentPreview) => a.id));
      }
      return next;
    });
  };

  // Select / deselect all visible
  const toggleSelectAll = () => {
    const filtered = getFilteredEmails();
    if (totalSelected > 0) {
      setSelections({});
    } else {
      const newSel: SelectionMap = {};
      for (const email of filtered) {
        if (!email.isAlreadyDownloaded) {
          newSel[email.id] = new Set(email.attachments.map((a: AttachmentPreview) => a.id));
        }
      }
      setSelections(newSel);
    }
  };

  // Scan inbox
  const handleScan = useCallback(async () => {
    if (!selectedAccount) {
      Alert.alert('Sin cuenta', 'Selecciona una cuenta para escanear.');
      return;
    }
    if (fromDate > toDate) {
      Alert.alert('Fechas inválidas', 'La fecha "desde" no puede ser mayor que la fecha "hasta".');
      return;
    }

    setLoading(true);
    setEmails([]);
    setSelections({});
    setScanned(false);

    try {
      const previewFn =
        selectedAccount.provider === 'gmail' ? previewGmailEmails : previewOutlookEmails;

      const results = await previewFn(selectedAccount, fromDate, toDate);

      setEmails(results);
      setScanned(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al escanear correos';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, fromDate, toDate]);

  // Download selected
  const handleDownload = useCallback(async () => {
    if (!selectedAccount || totalSelected === 0) return;

    const selectionsArr = Object.entries(selections)
      .map(([emailId, attIds]) => {
        const email = emails.find((e: EmailPreview) => e.id === emailId);
        if (!email) return null;
        const atts = email.attachments.filter((a: AttachmentPreview) => attIds.has(a.id));
        return { email, attachments: atts };
      })
      .filter(Boolean) as { email: EmailPreview; attachments: AttachmentPreview[] }[];

    setDownloading(true);
    try {
      const count = await downloadSelectedAttachments(
        selectedAccount,
        selectionsArr,
        (p) => setDownloadProgress(p),
      );

      Alert.alert(
        'Descarga completada',
        `${count} archivo${count !== 1 ? 's' : ''} descargado${count !== 1 ? 's' : ''}.`,
      );

      // Re-scan to update "already downloaded" status
      setSelections({});
      handleScan();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al descargar archivos';
      Alert.alert('Error', msg);
    } finally {
      setDownloading(false);
    }
  }, [selectedAccount, selections, emails, totalSelected, handleScan]);

  // Filter by extension
  const getFilteredEmails = (): EmailPreview[] => {
    if (filterExt === 'all') return emails;
    return emails.filter((e: EmailPreview) =>
      e.attachments.some((a: AttachmentPreview) => {
        if (filterExt === 'pdf') return a.extension === 'pdf';
        if (filterExt === 'images') return ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(a.extension);
        if (filterExt === 'excel') return ['xls', 'xlsx', 'csv'].includes(a.extension);
        if (filterExt === 'word') return ['doc', 'docx'].includes(a.extension);
        if (filterExt === 'xml') return a.extension === 'xml';
        return true;
      }),
    );
  };

  const filteredEmails = getFilteredEmails();

  // Unique extensions in results (for filter chips)
  const availableExtensions = new Set(
    emails.flatMap((e: EmailPreview) => e.attachments.map((a: AttachmentPreview) => a.extension)),
  );

  const filterChips = [
    { key: 'all', label: 'Todo' },
    ...(availableExtensions.has('pdf') ? [{ key: 'pdf', label: 'PDF' }] : []),
    ...(Array.from(availableExtensions).some((e: string) => ['jpg', 'jpeg', 'png'].includes(e))
      ? [{ key: 'images', label: 'Imágenes' }]
      : []),
    ...(Array.from(availableExtensions).some((e: string) => ['xls', 'xlsx', 'csv'].includes(e))
      ? [{ key: 'excel', label: 'Excel' }]
      : []),
    ...(Array.from(availableExtensions).some((e: string) => ['doc', 'docx'].includes(e))
      ? [{ key: 'word', label: 'Word' }]
      : []),
    ...(availableExtensions.has('xml') ? [{ key: 'xml', label: 'XML' }] : []),
  ];

  const renderAttachment = (att: AttachmentPreview, emailId: string, isDownloaded: boolean) => {
    const fileUI = getFileTypeUI(att.extension);
    const isSelected = selections[emailId]?.has(att.id) ?? false;

    return (
      <TouchableOpacity
        key={att.id}
        style={[
          styles.attachmentRow,
          { backgroundColor: isSelected ? theme.primarySubtle : theme.surface },
          isDownloaded && { opacity: 0.5 },
        ]}
        onPress={() => !isDownloaded && toggleAttachment(emailId, att.id)}
        disabled={isDownloaded}
      >
        <View style={[styles.attIcon, { backgroundColor: fileUI.bgColor }]}>
          <MaterialCommunityIcons name={fileUI.icon as any} size={20} color={fileUI.color} />
        </View>
        <View style={styles.attInfo}>
          <Text style={[styles.attFilename, { color: theme.textPrimary }]} numberOfLines={1}>
            {att.filename}
          </Text>
          <Text style={[styles.attMeta, { color: theme.textMuted }]}>
            {att.extension.toUpperCase()} · {formatBytes(att.size)}
          </Text>
        </View>
        {isDownloaded ? (
          <MaterialCommunityIcons name="check-circle" size={22} color={theme.textMuted} />
        ) : (
          <View
            style={[
              styles.checkbox,
              {
                borderColor: isSelected ? theme.primary : theme.border,
                backgroundColor: isSelected ? theme.primary : 'transparent',
              },
            ]}
          >
            {isSelected && (
              <MaterialCommunityIcons name="check" size={14} color="#FFF" />
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmail = ({ item: email }: { item: EmailPreview }) => {
    const isExpanded = expandedEmails.has(email.id);
    const emailSelected = selections[email.id];
    const selectedCount = emailSelected?.size ?? 0;
    const allSelected = selectedCount === email.attachments.length;
    const providerIcon = email.provider === 'gmail' ? 'gmail' : 'microsoft-outlook';
    const providerColor = email.provider === 'gmail' ? '#EA4335' : '#0078D4';

    return (
      <View style={[styles.emailCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {/* Header */}
        <TouchableOpacity style={styles.emailHeader} onPress={() => toggleExpand(email.id)}>
          <View style={styles.emailHeaderLeft}>
            <MaterialCommunityIcons name={providerIcon as any} size={20} color={providerColor} />
            <View style={styles.emailHeaderText}>
              <Text style={[styles.senderName, { color: theme.textPrimary }]} numberOfLines={1}>
                {email.senderName}
              </Text>
              <Text style={[styles.senderEmail, { color: theme.textMuted }]} numberOfLines={1}>
                {email.senderEmail}
              </Text>
            </View>
          </View>
          <View style={styles.emailHeaderRight}>
            <Text style={[styles.emailDate, { color: theme.textMuted }]}>
              {format(new Date(email.date), 'dd MMM', { locale: es })}
            </Text>
            <MaterialCommunityIcons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={theme.textMuted}
            />
          </View>
        </TouchableOpacity>

        {/* Subject */}
        <Text style={[styles.subject, { color: theme.textPrimary }]} numberOfLines={2}>
          {email.subject || '(Sin asunto)'}
        </Text>

        {/* Attachment count badge */}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: theme.primarySubtle }]}>
            <MaterialCommunityIcons name="paperclip" size={14} color={theme.primary} />
            <Text style={[styles.badgeText, { color: theme.primary }]}>
              {email.attachments.length} archivo{email.attachments.length !== 1 ? 's' : ''}
            </Text>
          </View>
          {email.isAlreadyDownloaded && (
            <View style={[styles.badge, { backgroundColor: '#ECFDF5' }]}>
              <MaterialCommunityIcons name="check-circle-outline" size={14} color="#10B981" />
              <Text style={[styles.badgeText, { color: '#10B981' }]}>Descargado</Text>
            </View>
          )}
          {!email.isAlreadyDownloaded && (
            <TouchableOpacity
              style={[styles.selectAllBtn, { borderColor: theme.border }]}
              onPress={() => toggleEmailAll(email)}
            >
              <MaterialCommunityIcons
                name={allSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={16}
                color={allSelected ? theme.primary : theme.textMuted}
              />
              <Text style={[styles.selectAllText, { color: theme.textSecondary }]}>
                {allSelected ? 'Deseleccionar' : 'Seleccionar todo'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Expanded: attachment list */}
        {isExpanded && (
          <View style={styles.attachmentList}>
            {email.attachments.map((att: AttachmentPreview) =>
              renderAttachment(att, email.id, email.isAlreadyDownloaded),
            )}
          </View>
        )}
      </View>
    );
  };

  const dynamicStyles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      paddingTop: insets.top + Spacing.sm,
      paddingHorizontal: Spacing.base,
      paddingBottom: Spacing.md,
      backgroundColor: theme.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTitle: {
      ...Typography.headingL,
      color: theme.textPrimary,
      marginBottom: Spacing.sm,
    },
  });

  return (
    <View style={dynamicStyles.container}>
      {/* Header */}
      <View style={dynamicStyles.header}>
        <Text style={dynamicStyles.headerTitle}>Bandeja Inteligente</Text>

        {/* Account selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: Spacing.sm, marginBottom: Spacing.md }}
        >
          {activeAccounts.map((acc: Account) => {
            const isActive = selectedAccount?.id === acc.id;
            const icon = acc.provider === 'gmail' ? 'gmail' : 'microsoft-outlook';
            const color = acc.provider === 'gmail' ? '#EA4335' : '#0078D4';
            return (
              <TouchableOpacity
                key={acc.id}
                style={[
                  styles.accountChip,
                  {
                    backgroundColor: isActive ? theme.primarySubtle : theme.background,
                    borderColor: isActive ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => {
                  setSelectedAccount(acc);
                  setEmails([]);
                  setScanned(false);
                  setSelections({});
                }}
              >
                <MaterialCommunityIcons name={icon as any} size={16} color={color} />
                <Text
                  style={[
                    styles.accountChipText,
                    { color: isActive ? theme.primary : theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {acc.email}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Date range display + picker trigger */}
        <TouchableOpacity
          style={[styles.dateRow, { backgroundColor: theme.background, borderColor: theme.border }]}
          onPress={() => setShowDateModal(true)}
        >
          <MaterialCommunityIcons name="calendar-range" size={18} color={theme.textSecondary} />
          <Text style={[styles.dateBtnText, { color: theme.textPrimary }]}>
            {format(fromDate, 'dd/MM/yyyy')} — {format(toDate, 'dd/MM/yyyy')}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={18} color={theme.textMuted} />
        </TouchableOpacity>

        {/* Scan button */}
        <TouchableOpacity
          style={[styles.scanBtn, { backgroundColor: theme.primary }]}
          onPress={handleScan}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <MaterialCommunityIcons name="email-search-outline" size={20} color="#FFF" />
          )}
          <Text style={styles.scanBtnText}>
            {loading ? 'Escaneando...' : 'Escanear bandeja'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Date preset modal */}
      <Modal
        visible={showDateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDateModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDateModal(false)}
        >
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
              Rango de fechas
            </Text>
            {DATE_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.days}
                style={[
                  styles.presetBtn,
                  {
                    borderColor: theme.border,
                    backgroundColor: activeDatePreset === preset.days ? theme.primarySubtle : 'transparent',
                  },
                ]}
                onPress={() => {
                  setFromDate(subDays(new Date(), preset.days));
                  setActiveDatePreset(preset.days);
                  setShowDateModal(false);
                }}
              >
                <Text
                  style={[
                    styles.presetText,
                    {
                      color: activeDatePreset === preset.days ? theme.primary : theme.textPrimary,
                      fontWeight: activeDatePreset === preset.days ? '600' : '400',
                    },
                  ]}
                >
                  {preset.label}
                </Text>
                {activeDatePreset === preset.days && (
                  <MaterialCommunityIcons name="check" size={18} color={theme.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Filter chips (only when results exist) */}
      {scanned && emails.length > 0 && filterChips.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {filterChips.map((chip) => (
            <TouchableOpacity
              key={chip.key}
              style={[
                styles.filterChip,
                {
                  backgroundColor: filterExt === chip.key ? theme.primary : theme.surface,
                  borderColor: filterExt === chip.key ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setFilterExt(chip.key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: filterExt === chip.key ? '#FFF' : theme.textSecondary },
                ]}
              >
                {chip.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Results */}
      {scanned && emails.length === 0 && !loading && (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="email-open-outline" size={56} color={theme.textMuted} />
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
            Sin correos con adjuntos
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
            No se encontraron correos con archivos adjuntos en el rango seleccionado.
          </Text>
        </View>
      )}

      {filteredEmails.length > 0 && (
        <>
          {/* Summary bar */}
          <View style={[styles.summaryBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <TouchableOpacity onPress={toggleSelectAll} style={styles.selectAllRow}>
              <MaterialCommunityIcons
                name={totalSelected > 0 ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={20}
                color={totalSelected > 0 ? theme.primary : theme.textMuted}
              />
              <Text style={[styles.summaryText, { color: theme.textSecondary }]}>
                {totalSelected > 0
                  ? `${totalSelected} seleccionado${totalSelected !== 1 ? 's' : ''}`
                  : `${filteredEmails.length} correo${filteredEmails.length !== 1 ? 's' : ''}`}
              </Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={filteredEmails}
            keyExtractor={(e: EmailPreview) => e.id}
            renderItem={renderEmail}
            contentContainerStyle={{ padding: Spacing.md, paddingBottom: totalSelected > 0 ? 100 : Spacing.xl }}
            ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          />
        </>
      )}

      {/* Floating download button */}
      {totalSelected > 0 && (
        <View style={[styles.fab, { backgroundColor: theme.primary }, Shadows.large]}>
          <TouchableOpacity
            style={styles.fabInner}
            onPress={handleDownload}
            disabled={downloading}
          >
            {downloading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <MaterialCommunityIcons name="download" size={22} color="#FFF" />
            )}
            <Text style={styles.fabText}>
              {downloading
                ? `Descargando ${downloadProgress.current}/${downloadProgress.total}...`
                : `Descargar ${totalSelected} archivo${totalSelected !== 1 ? 's' : ''}`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
    borderWidth: 1.5,
    gap: Spacing.xs,
  },
  accountChipText: {
    ...Typography.caption,
    fontWeight: '500',
    maxWidth: 160,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.input,
    borderWidth: 1,
  },
  dateBtnText: {
    ...Typography.bodyM,
    flex: 1,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.input,
  },
  scanBtnText: {
    ...Typography.bodyM,
    color: '#FFF',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    width: '100%',
    borderRadius: BorderRadius.card,
    padding: Spacing.xl,
    ...Shadows.large,
  },
  modalTitle: {
    ...Typography.headingM,
    marginBottom: Spacing.base,
  },
  presetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderRadius: BorderRadius.input,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  presetText: {
    ...Typography.bodyM,
  },
  filterRow: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  filterChipText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  summaryText: {
    ...Typography.bodyM,
    fontWeight: '500',
  },
  emailCard: {
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    padding: Spacing.base,
    ...Shadows.subtle,
  },
  emailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  emailHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  emailHeaderText: {
    flex: 1,
  },
  emailHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  senderName: {
    ...Typography.bodyM,
    fontWeight: '600',
  },
  senderEmail: {
    ...Typography.caption,
  },
  subject: {
    ...Typography.bodyM,
    marginBottom: Spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.pill,
  },
  badgeText: {
    ...Typography.caption,
    fontWeight: '500',
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    marginLeft: 'auto',
  },
  selectAllText: {
    ...Typography.caption,
    fontWeight: '500',
  },
  attachmentList: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.input,
  },
  attIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attInfo: {
    flex: 1,
  },
  attFilename: {
    ...Typography.bodyM,
    fontWeight: '500',
  },
  attMeta: {
    ...Typography.caption,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
  },
  emptyTitle: {
    ...Typography.headingM,
    marginTop: Spacing.base,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    ...Typography.bodyM,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: Spacing.xl,
    left: Spacing.base,
    right: Spacing.base,
    borderRadius: BorderRadius.card,
  },
  fabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
  },
  fabText: {
    ...Typography.bodyM,
    color: '#FFF',
    fontWeight: '700',
  },
  emailDate: {
    ...Typography.caption,
  },
});
