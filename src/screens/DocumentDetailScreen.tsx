import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  Share,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Colors, Spacing, Typography, BorderRadius, Shadows, CategoryColors } from '../utils/theme';
import { CategoryBadge, ProviderBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useAppStore } from '../store/useAppStore';
import { getDocumentById, toggleStarDocument, updateDocumentNotes, deleteDocument } from '../database/documents';
import { Document } from '../types';
import { formatBytes } from '../utils/format';

export default function DocumentDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { documentId } = route.params;

  const { updateDocument, removeDocument, accounts } = useAppStore();
  const [doc, setDoc] = useState<Document | null>(null);
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [notesInput, setNotesInput] = useState('');

  useEffect(() => {
    loadDoc();
  }, [documentId]);

  async function loadDoc() {
    const d = await getDocumentById(documentId);
    setDoc(d);
    if (d?.notes) setNotesInput(d.notes);
  }

  const account = accounts.find((a) => a.id === doc?.accountId);

  const handleToggleStar = useCallback(async () => {
    if (!doc) return;
    const newVal = !doc.isStarred;
    await toggleStarDocument(doc.id, newVal);
    setDoc((d) => d ? { ...d, isStarred: newVal } : d);
    updateDocument(doc.id, { isStarred: newVal });
  }, [doc]);

  const handleSaveNotes = useCallback(async () => {
    if (!doc) return;
    await updateDocumentNotes(doc.id, notesInput);
    setDoc((d) => d ? { ...d, notes: notesInput } : d);
    updateDocument(doc.id, { notes: notesInput });
    setNotesModalVisible(false);
  }, [doc, notesInput]);

  const handleShare = useCallback(async () => {
    if (!doc) return;
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(doc.filePath);
      } else {
        await Share.share({ url: doc.filePath, title: doc.originalFilename });
      }
    } catch (err: any) {
      Alert.alert('Error', 'No se pudo compartir el archivo.');
    }
  }, [doc]);

  const handleDelete = useCallback(() => {
    if (!doc) return;
    Alert.alert(
      'Eliminar documento',
      `¿Seguro que quieres eliminar "${doc.originalFilename}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await FileSystem.deleteAsync(doc.filePath, { idempotent: true });
              await deleteDocument(doc.id);
              removeDocument(doc.id);
              navigation.goBack();
            } catch (err) {
              Alert.alert('Error', 'No se pudo eliminar el documento.');
            }
          },
        },
      ]
    );
  }, [doc]);

  if (!doc) return null;

  const isImage = ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(doc.fileExtension);
  const isText = ['xml', 'txt'].includes(doc.fileExtension);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Nav Header */}
      <View style={styles.navHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{doc.originalFilename}</Text>
        <View style={styles.navActions}>
          <TouchableOpacity onPress={handleShare}>
            <Ionicons name="share-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Preview Area */}
        <View style={styles.previewContainer}>
          {isImage ? (
            <Image
              source={{ uri: doc.filePath }}
              style={styles.imagePreview}
              contentFit="contain"
            />
          ) : doc.fileExtension === 'pdf' ? (
            <PdfPlaceholder onOpen={handleShare} />
          ) : (
            <View style={styles.unsupportedPreview}>
              <MaterialCommunityIcons name="file-document-outline" size={64} color={Colors.textMuted} />
              <Text style={styles.unsupportedText}>Vista previa no disponible</Text>
              <Button label="Abrir en otra app" onPress={handleShare} variant="outline" size="sm" style={{ marginTop: Spacing.md }} />
            </View>
          )}
        </View>

        {/* Metadata */}
        <View style={styles.metaContainer}>
          {/* Category */}
          <View style={styles.metaRow}>
            <CategoryBadge category={doc.category} />
            {account && <ProviderBadge provider={account.provider} />}
          </View>

          <MetaItem
            icon="file-outline"
            label="Archivo"
            value={doc.originalFilename}
            copyable
          />
          <MetaItem
            icon="account-outline"
            label="Remitente"
            value={`${doc.senderName ?? ''} ${doc.senderEmail ? `<${doc.senderEmail}>` : ''}`.trim()}
          />
          <MetaItem
            icon="email-outline"
            label="Asunto"
            value={doc.subject ?? '—'}
          />
          <MetaItem
            icon="calendar-outline"
            label="Recibido"
            value={format(doc.emailDate, "dd 'de' MMMM yyyy", { locale: es })}
          />
          <MetaItem
            icon="database-outline"
            label="Tamaño"
            value={formatBytes(doc.fileSize)}
          />
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <ActionButton
            icon={doc.isStarred ? 'star' : 'star-outline'}
            label={doc.isStarred ? 'Destacado' : 'Destacar'}
            color={doc.isStarred ? Colors.warning : Colors.textSecondary}
            onPress={handleToggleStar}
          />
          <ActionButton icon="share-variant-outline" label="Compartir" onPress={handleShare} />
          <ActionButton
            icon="note-text-outline"
            label="Nota"
            onPress={() => setNotesModalVisible(true)}
          />
          <ActionButton icon="delete-outline" label="Eliminar" color={Colors.danger} onPress={handleDelete} />
        </View>

        {/* Notes */}
        <TouchableOpacity
          style={styles.notesSection}
          onPress={() => setNotesModalVisible(true)}
        >
          <Text style={styles.notesLabel}>Notas</Text>
          <Text style={[styles.notesValue, !doc.notes && styles.notesPlaceholder]}>
            {doc.notes ?? 'Añadir nota...'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>

      {/* Notes Modal */}
      <Modal visible={notesModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setNotesModalVisible(false)}>
              <Text style={styles.modalCancel}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Nota</Text>
            <TouchableOpacity onPress={handleSaveNotes}>
              <Text style={styles.modalSave}>Guardar</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.notesInput}
            value={notesInput}
            onChangeText={setNotesInput}
            placeholder="Escribe una nota sobre este documento..."
            placeholderTextColor={Colors.textMuted}
            multiline
            autoFocus
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function PdfPlaceholder({ onOpen }: { onOpen: () => void }) {
  return (
    <View style={styles.pdfPlaceholder}>
      <MaterialCommunityIcons name="file-pdf-box" size={64} color="#EF4444" />
      <Text style={styles.pdfText}>Documento PDF</Text>
      <Button label="Abrir PDF" onPress={onOpen} size="sm" style={{ marginTop: Spacing.md }} />
    </View>
  );
}

function MetaItem({
  icon,
  label,
  value,
  copyable,
}: {
  icon: string;
  label: string;
  value: string;
  copyable?: boolean;
}) {
  return (
    <View style={styles.metaItem}>
      <MaterialCommunityIcons name={icon as any} size={18} color={Colors.textMuted} />
      <View style={styles.metaContent}>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={styles.metaValue}>{value}</Text>
      </View>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  color = Colors.textSecondary,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.75}>
      <MaterialCommunityIcons name={icon as any} size={22} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
  },
  backBtn: { padding: 4 },
  navTitle: { ...Typography.bodyL, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  navActions: { flexDirection: 'row', gap: Spacing.md },
  container: { flex: 1 },
  previewContainer: {
    height: 280,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreview: { width: '100%', height: '100%' },
  unsupportedPreview: { alignItems: 'center', gap: Spacing.sm },
  unsupportedText: { ...Typography.bodyM, color: Colors.textMuted },
  pdfPlaceholder: { alignItems: 'center', gap: Spacing.sm },
  pdfText: { ...Typography.bodyM, color: Colors.textSecondary, fontWeight: '500' },
  metaContainer: {
    backgroundColor: Colors.surface,
    margin: Spacing.base,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    gap: Spacing.md,
    ...Shadows.subtle,
  },
  metaRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  metaContent: { flex: 1 },
  metaLabel: { ...Typography.caption, color: Colors.textMuted },
  metaValue: { ...Typography.bodyM, color: Colors.textPrimary, marginTop: 2 },
  actionsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.base,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.subtle,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.base,
    gap: 6,
  },
  actionLabel: { ...Typography.caption, fontWeight: '500' },
  notesSection: {
    backgroundColor: Colors.surface,
    margin: Spacing.base,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    ...Shadows.subtle,
  },
  notesLabel: { ...Typography.caption, color: Colors.textMuted, marginBottom: 6 },
  notesValue: { ...Typography.bodyM, color: Colors.textPrimary },
  notesPlaceholder: { color: Colors.textMuted },
  modalSafe: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  modalTitle: { ...Typography.bodyL, fontWeight: '600', color: Colors.textPrimary },
  modalCancel: { ...Typography.bodyM, color: Colors.textSecondary },
  modalSave: { ...Typography.bodyM, color: Colors.primary, fontWeight: '600' },
  notesInput: {
    flex: 1,
    padding: Spacing.base,
    ...Typography.bodyL,
    color: Colors.textPrimary,
    textAlignVertical: 'top',
  },
});
