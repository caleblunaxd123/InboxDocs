import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as WebBrowser from 'expo-web-browser';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Colors, Spacing, Typography, BorderRadius, Shadows, CategoryColors, CategoryLabels } from '../utils/theme';
import { useTheme } from '../utils/useTheme';
import { CategoryBadge, ProviderBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useAppStore } from '../store/useAppStore';
import { getDocumentById, toggleStarDocument, updateDocumentNotes, deleteDocument, updateDocumentCategory } from '../database/documents';
import { Document, CategoryId, SunatInvoice } from '../types';
import { formatBytes } from '../utils/format';
import { getFileTypeUI } from '../utils/fileTypes';
import { getInvoiceForDocument } from '../services/invoiceService';

const CATEGORIES: CategoryId[] = ['invoice', 'receipt', 'statement', 'contract', 'tax', 'insurance', 'medical', 'other'];

export default function DocumentDetailScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { documentId } = route.params;

  const { updateDocument, removeDocument, accounts } = useAppStore();
  const [doc, setDoc] = useState<Document | null>(null);
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [notesInput, setNotesInput] = useState('');
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [fileExists, setFileExists] = useState<boolean | null>(null);
  const [sunatInvoice, setSunatInvoice] = useState<SunatInvoice | null>(null);

  useEffect(() => {
    loadDoc();
  }, [documentId]);

  useEffect(() => {
    if (doc?.filePath) {
      FileSystem.getInfoAsync(doc.filePath).then(info => setFileExists(info.exists));
    }
  }, [doc?.filePath]);

  async function loadDoc() {
    const d = await getDocumentById(documentId);
    setDoc(d);
    if (d?.notes) setNotesInput(d.notes);
    if (d && ['xml', 'txt', 'csv'].includes(d.fileExtension)) {
      setLoadingText(true);
      try {
        const content = await FileSystem.readAsStringAsync(d.filePath, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        setTextContent(content.slice(0, 3000));
      } catch {
        setTextContent(null);
      } finally {
        setLoadingText(false);
      }
    }
    // Load SUNAT invoice if present
    if (d) {
      const inv = await getInvoiceForDocument(d.id);
      setSunatInvoice(inv);
    }
  }

  const account = accounts.find((a) => a.id === doc?.accountId);

  const handleToggleStar = useCallback(async () => {
    if (!doc) return;
    const newVal = !doc.isStarred;
    await toggleStarDocument(doc.id, newVal);
    setDoc((d) => (d ? { ...d, isStarred: newVal } : d));
    updateDocument(doc.id, { isStarred: newVal });
  }, [doc]);

  const handleSaveNotes = useCallback(async () => {
    if (!doc) return;
    await updateDocumentNotes(doc.id, notesInput);
    setDoc((d) => (d ? { ...d, notes: notesInput } : d));
    updateDocument(doc.id, { notes: notesInput });
    setNotesModalVisible(false);
  }, [doc, notesInput]);

  const handleChangeCategory = useCallback(async (cat: CategoryId) => {
    if (!doc) return;
    await updateDocumentCategory(doc.id, cat, 1.0);
    setDoc((d) => (d ? { ...d, category: cat, categoryConfidence: 1.0 } : d));
    updateDocument(doc.id, { category: cat, categoryConfidence: 1.0 });
    setCategoryModalVisible(false);
  }, [doc]);

  const handleShare = useCallback(async () => {
    if (!doc) return;
    try {
      const info = await FileSystem.getInfoAsync(doc.filePath);
      if (!info.exists) {
        Alert.alert('Archivo no encontrado', 'El archivo ya no está disponible. Sincroniza de nuevo para descargarlo.');
        return;
      }
      if (Platform.OS === 'android') {
        // Android: get a content:// URI and launch the system file picker
        const contentUri = await FileSystem.getContentUriAsync(doc.filePath);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
          type: doc.mimeType || 'application/octet-stream',
        });
      } else {
        // iOS: open in Safari overlay — renders PDFs natively in-app
        await WebBrowser.openBrowserAsync(doc.filePath, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });
      }
    } catch (err: any) {
      // Fallback: standard share sheet
      try {
        await Sharing.shareAsync(doc.filePath, {
          mimeType: doc.mimeType || 'application/octet-stream',
          dialogTitle: doc.originalFilename,
        });
      } catch (e2: any) {
        Alert.alert('No se pudo abrir', 'Instala una app compatible (Adobe, WPS, Google Drive) e intenta de nuevo.');
      }
    }
  }, [doc]);

  const handleDelete = useCallback(() => {
    if (!doc) return;
    Alert.alert(
      'Eliminar documento',
      `¿Seguro que quieres eliminar "${doc.originalFilename}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDocument(doc.id);
              removeDocument(doc.id);
              navigation.goBack();
            } catch {
              Alert.alert('Error', 'No se pudo eliminar el documento.');
            }
          },
        },
      ]
    );
  }, [doc]);

  if (!doc)
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );

  const isImage = ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(doc.fileExtension);
  const isText = ['xml', 'txt', 'csv'].includes(doc.fileExtension);
  const ui = getFileTypeUI(doc.fileExtension);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.navHeader, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: theme.textPrimary }]} numberOfLines={1}>{doc.originalFilename}</Text>
        {fileExists === false && (
          <View style={styles.unavailableBadge}>
            <MaterialCommunityIcons name="cloud-off-outline" size={12} color={Colors.danger} />
            <Text style={styles.unavailableText}>Sin archivo</Text>
          </View>
        )}
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
          <Ionicons name="share-outline" size={22} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={[styles.previewContainer, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          {isImage ? (
            <Image source={{ uri: doc.filePath }} style={styles.imagePreview} contentFit="contain" />
          ) : isText ? (
            <TextPreview content={textContent} loading={loadingText} ext={doc.fileExtension} />
          ) : (
            <DocumentPlaceholder
            ui={ui}
            ext={doc.fileExtension}
            onOpen={handleShare}
            onViewInApp={['pdf', 'docx', 'xlsx', 'xls'].includes(doc.fileExtension) ? () => navigation.navigate('DocumentViewer', {
              filePath: doc.filePath,
              filename: doc.originalFilename,
              mimeType: doc.mimeType,
              fileExtension: doc.fileExtension,
            }) : undefined}
          />
          )}
        </View>

        <View style={[styles.metaContainer, { backgroundColor: theme.surface }]}>
          <TouchableOpacity style={styles.categoryRow} onPress={() => setCategoryModalVisible(true)} activeOpacity={0.7}>
            <CategoryBadge category={doc.category} />
            {account && <ProviderBadge provider={account.provider} />}
            {(doc.categoryConfidence ?? 1) < 0.9 && (
              <View style={styles.aiChip}>
                <MaterialCommunityIcons name="robot-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.aiChipText}>IA</Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            <MaterialCommunityIcons name="pencil-outline" size={16} color={theme.textMuted} />
            <Text style={[styles.editCatText, { color: theme.textMuted }]}>Cambiar</Text>
          </TouchableOpacity>
          <View style={[styles.metaDivider, { backgroundColor: theme.border }]} />
          <MetaItem icon="file-outline" label="Archivo" value={doc.originalFilename} />
          <MetaItem icon="account-outline" label="Remitente" value={doc.senderName && doc.senderEmail ? `${doc.senderName} <${doc.senderEmail}>` : doc.senderEmail ?? '—'} />
          <MetaItem icon="email-outline" label="Asunto" value={doc.subject ?? '—'} />
          <MetaItem icon="calendar-outline" label="Recibido" value={format(doc.emailDate, "dd 'de' MMMM yyyy", { locale: es })} />
          <MetaItem icon="database-outline" label="Tamaño" value={formatBytes(doc.fileSize)} />
          <MetaItem icon="download-outline" label="Descargado" value={format(doc.downloadedAt, "dd 'de' MMMM yyyy", { locale: es })} />
        </View>

        <View style={[styles.actionsRow, { backgroundColor: theme.surface }]}>
          <ActionButton icon={doc.isStarred ? 'star' : 'star-outline'} label={doc.isStarred ? 'Destacado' : 'Destacar'} color={doc.isStarred ? Colors.warning : Colors.textSecondary} onPress={handleToggleStar} />
          {(isImage || ['pdf', 'docx', 'xlsx', 'xls'].includes(doc.fileExtension)) && (
            <ActionButton
              icon="eye-outline"
              label="Ver"
              color={Colors.primary}
              onPress={() => navigation.navigate('DocumentViewer', {
                filePath: doc.filePath,
                filename: doc.originalFilename,
                mimeType: doc.mimeType,
                fileExtension: doc.fileExtension,
              })}
            />
          )}
          {sunatInvoice && (
            <ActionButton
              icon="receipt"
              label="Ver factura"
              color="#2563EB"
              onPress={() => navigation.navigate('InvoiceDetail', { documentId: doc.id })}
            />
          )}
          <ActionButton icon="share-variant-outline" label="Compartir" onPress={handleShare} />
          <ActionButton icon="note-text-outline" label={doc.notes ? 'Ver nota' : 'Añadir nota'} onPress={() => setNotesModalVisible(true)} />
          <ActionButton icon="delete-outline" label="Eliminar" color={Colors.danger} onPress={handleDelete} />
        </View>

        {doc.notes ? (
          <TouchableOpacity style={[styles.notesSection, { backgroundColor: theme.surface }]} onPress={() => setNotesModalVisible(true)}>
            <View style={styles.notesHeader}>
              <MaterialCommunityIcons name="note-text-outline" size={16} color={theme.primary} />
              <Text style={[styles.notesLabel, { color: theme.primary }]}>Nota</Text>
            </View>
            <Text style={[styles.notesValue, { color: theme.textPrimary }]}>{doc.notes}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.addNoteBtn} onPress={() => setNotesModalVisible(true)}>
            <MaterialCommunityIcons name="plus" size={16} color={theme.primary} />
            <Text style={[styles.addNoteText, { color: theme.primary }]}>Añadir nota</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>

      <Modal visible={notesModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.modalSafe, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
            <TouchableOpacity onPress={() => setNotesModalVisible(false)}><Text style={[styles.modalCancel, { color: theme.textSecondary }]}>Cancelar</Text></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Nota</Text>
            <TouchableOpacity onPress={handleSaveNotes}><Text style={[styles.modalSave, { color: theme.primary }]}>Guardar</Text></TouchableOpacity>
          </View>
          <TextInput style={[styles.notesInput, { color: theme.textPrimary }]} value={notesInput} onChangeText={setNotesInput} placeholder="Escribe una nota sobre este documento..." placeholderTextColor={theme.textMuted} multiline autoFocus />
        </SafeAreaView>
      </Modal>

      <Modal visible={categoryModalVisible} transparent animationType="slide">
        <View style={styles.catOverlay}>
          <View style={[styles.catSheet, { backgroundColor: theme.surface }]}>
            <View style={[styles.catSheetHandle, { backgroundColor: theme.border }]} />
            <Text style={[styles.catSheetTitle, { color: theme.textPrimary }]}>Cambiar categoría</Text>
            <Text style={[styles.catSheetSub, { color: theme.textMuted }]}>La categoría actual se reemplazará</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {CATEGORIES.map((cat) => {
                const catColor = CategoryColors[cat] ?? Colors.primary;
                const isSelected = doc.category === cat;
                return (
                  <TouchableOpacity key={cat} style={[styles.catOption, isSelected && styles.catOptionSelected]} onPress={() => handleChangeCategory(cat)} activeOpacity={0.75}>
                    <View style={[styles.catDot, { backgroundColor: catColor }]} />
                    <Text style={[styles.catOptionText, { color: theme.textPrimary }, isSelected && { color: theme.primary, fontWeight: '600' }]}>{CategoryLabels[cat]}</Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color={theme.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={[styles.catCancel, { borderTopColor: theme.border }]} onPress={() => setCategoryModalVisible(false)}>
              <Text style={[styles.catCancelText, { color: theme.textSecondary }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function TextPreview({ content, loading, ext }: { content: string | null; loading: boolean; ext: string }) {
  const theme = useTheme();
  if (loading) return (
    <View style={styles.textPreviewLoading}>
      <ActivityIndicator color={theme.primary} />
      <Text style={[styles.textPreviewLoadingText, { color: theme.textMuted }]}>Cargando contenido...</Text>
    </View>
  );
  if (!content) return (
    <View style={styles.textPreviewEmpty}>
      <MaterialCommunityIcons name="file-code-outline" size={40} color={theme.textMuted} />
      <Text style={[styles.textPreviewEmptyText, { color: theme.textMuted }]}>No se pudo leer el contenido</Text>
    </View>
  );
  return (
    <ScrollView style={styles.textPreviewScroll} nestedScrollEnabled>
      <Text style={[styles.textPreviewContent, { color: theme.textPrimary }]}>{content}</Text>
      {content.length >= 3000 && <Text style={[styles.textPreviewTruncated, { color: theme.textMuted }]}>— Vista previa truncada a 3000 caracteres —</Text>}
    </ScrollView>
  );
}

function DocumentPlaceholder({ ui, ext, onOpen, onViewInApp }: { ui: any; ext: string; onOpen: () => void; onViewInApp?: () => void }) {
  const theme = useTheme();
  const label = ext === 'pdf' ? 'Documento PDF' : ext === 'docx' ? 'Documento Word' : ext === 'xlsx' ? 'Hoja de cálculo Excel' : ext === 'pptx' ? 'Presentación PowerPoint' : `Archivo ${ext.toUpperCase()}`;
  return (
    <View style={styles.documentPlaceholder}>
      <View style={[styles.docIconWrapper, { backgroundColor: ui.bgColor, borderColor: ui.color + '40' }]}>
        <MaterialCommunityIcons name={ui.icon as any} size={52} color={ui.color} />
        <Text style={[styles.docExtLabel, { color: ui.color }]}>{ext.toUpperCase()}</Text>
      </View>
      <Text style={[styles.docPlaceholderText, { color: theme.textPrimary }]}>{label}</Text>
      {onViewInApp && ['pdf', 'docx', 'xlsx', 'xls'].includes(ext) ? (
        <>
          <Text style={[styles.docPlaceholderSub, { color: theme.textMuted }]}>Visualiza el documento directamente en la app</Text>
          <TouchableOpacity style={[styles.openExternalBtn, { backgroundColor: theme.primarySubtle }]} onPress={onViewInApp} activeOpacity={0.8}>
            <MaterialCommunityIcons name="eye-outline" size={18} color={theme.primary} />
            <Text style={[styles.openExternalText, { color: theme.primary }]}>Ver en InboxDocs</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={[styles.docPlaceholderSub, { color: theme.textMuted }]}>Vista previa no disponible — abre el archivo con otra app instalada en tu dispositivo</Text>
          <TouchableOpacity style={[styles.openExternalBtn, { backgroundColor: theme.primarySubtle }]} onPress={onOpen} activeOpacity={0.8}>
            <MaterialCommunityIcons name="open-in-app" size={18} color={theme.primary} />
            <Text style={[styles.openExternalText, { color: theme.primary }]}>Abrir con otra aplicación</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function MetaItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.metaItem}>
      <MaterialCommunityIcons name={icon as any} size={16} color={theme.textMuted} style={{ marginTop: 2 }} />
      <View style={styles.metaContent}>
        <Text style={[styles.metaLabel, { color: theme.textMuted }]}>{label}</Text>
        <Text style={[styles.metaValue, { color: theme.textPrimary }]} selectable>{value}</Text>
      </View>
    </View>
  );
}

function ActionButton({ icon, label, onPress, color = Colors.textSecondary }: { icon: string; label: string; onPress: () => void; color?: string }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.actionBtnIcon, { backgroundColor: color + '18' }]}>
        <MaterialCommunityIcons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface, gap: Spacing.sm },
  backBtn: { padding: 4 },
  shareBtn: { padding: 4 },
  navTitle: { ...Typography.bodyL, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  container: { flex: 1 },
  previewContainer: { height: 280, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  imagePreview: { width: '100%', height: '100%' },
  textPreviewScroll: { flex: 1, padding: Spacing.base },
  textPreviewContent: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, color: Colors.textPrimary, lineHeight: 18 },
  textPreviewTruncated: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.md },
  textPreviewLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  textPreviewLoadingText: { ...Typography.caption, color: Colors.textMuted },
  textPreviewEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  textPreviewEmptyText: { ...Typography.bodyM, color: Colors.textMuted },
  documentPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.xl },
  docIconWrapper: { width: 96, height: 112, borderRadius: BorderRadius.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, gap: Spacing.xs, ...Shadows.subtle },
  docExtLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  docPlaceholderText: { ...Typography.bodyL, color: Colors.textPrimary, fontWeight: '600', marginTop: Spacing.xs },
  docPlaceholderSub: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center' },
  openExternalBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm, backgroundColor: Colors.primarySubtle, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.input },
  openExternalText: { ...Typography.bodyM, color: Colors.primary, fontWeight: '600' },
  metaContainer: { backgroundColor: Colors.surface, margin: Spacing.base, borderRadius: BorderRadius.card, padding: Spacing.base, gap: Spacing.sm, ...Shadows.subtle },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingBottom: Spacing.sm },
  aiChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  aiChipText: { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },
  editCatText: { ...Typography.caption, color: Colors.textMuted },
  metaDivider: { height: 1, backgroundColor: Colors.border },
  metaItem: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  metaContent: { flex: 1 },
  metaLabel: { ...Typography.caption, color: Colors.textMuted },
  metaValue: { ...Typography.bodyM, color: Colors.textPrimary, marginTop: 1 },
  actionsRow: { flexDirection: 'row', backgroundColor: Colors.surface, marginHorizontal: Spacing.base, borderRadius: BorderRadius.card, ...Shadows.subtle, paddingVertical: Spacing.sm },
  actionBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, gap: 6 },
  actionBtnIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { ...Typography.caption, fontWeight: '500' },
  notesSection: { backgroundColor: Colors.surface, margin: Spacing.base, borderRadius: BorderRadius.card, padding: Spacing.base, ...Shadows.subtle, gap: Spacing.sm },
  notesHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  notesLabel: { ...Typography.caption, color: Colors.primary, fontWeight: '600' },
  notesValue: { ...Typography.bodyM, color: Colors.textPrimary },
  addNoteBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginHorizontal: Spacing.base, marginTop: Spacing.sm, paddingVertical: Spacing.sm },
  addNoteText: { ...Typography.bodyM, color: Colors.primary },
  modalSafe: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
  modalTitle: { ...Typography.bodyL, fontWeight: '600', color: Colors.textPrimary },
  modalCancel: { ...Typography.bodyM, color: Colors.textSecondary },
  modalSave: { ...Typography.bodyM, color: Colors.primary, fontWeight: '600' },
  notesInput: { flex: 1, padding: Spacing.base, ...Typography.bodyL, color: Colors.textPrimary, textAlignVertical: 'top' },
  catOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  catSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.xl, paddingBottom: Spacing.xxxl, gap: Spacing.sm, maxHeight: '80%' },
  catSheetHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  catSheetTitle: { ...Typography.headingM, color: Colors.textPrimary },
  catSheetSub: { ...Typography.caption, color: Colors.textMuted, marginBottom: Spacing.sm },
  catOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.input, marginBottom: Spacing.xs },
  catOptionSelected: { backgroundColor: Colors.primarySubtle },
  catDot: { width: 12, height: 12, borderRadius: 6 },
  catOptionText: { ...Typography.bodyM, color: Colors.textPrimary, flex: 1 },
  catCancel: { alignItems: 'center', paddingVertical: Spacing.md, marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  catCancelText: { ...Typography.bodyM, color: Colors.textSecondary },
  unavailableBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  unavailableText: { fontSize: 11, color: Colors.danger, fontWeight: '600' },
});
