import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../utils/theme';
import { useAppStore } from '../store/useAppStore';
import { Avatar } from '../components/ui/Avatar';
import { ProviderBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { getAllSettings, setSetting } from '../database/settings';
import { deleteAccount } from '../database/accounts';
import { testOpenAIConnection } from '../services/aiService';
import { AppSettings } from '../types';
import * as FileSystem from 'expo-file-system/legacy';
import { getDocumentStats } from '../database/documents';
import { formatBytes } from '../utils/format';

const ATTACHMENT_DIR = `${FileSystem.documentDirectory}inboxdocs/attachments/`;
const VERSION = '1.0.0';

export default function SettingsScreen() {
  const { accounts, removeAccount, settings, setSettings, updateSetting } = useAppStore();
  const [storageUsed, setStorageUsed] = useState(0);
  const [totalDocs, setTotalDocs] = useState(0);
  const [testingAI, setTestingAI] = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [localApiKey, setLocalApiKey] = useState('');

  useEffect(() => {
    loadSettings();
    loadStorage();
  }, []);

  async function loadSettings() {
    const s = await getAllSettings();
    setSettings(s);
    setLocalApiKey(s.openai_api_key);
  }

  async function loadStorage() {
    const stats = await getDocumentStats();
    setTotalDocs(stats.total);
    setStorageUsed(stats.totalSize);
  }

  const handleToggle = useCallback(
    async (key: keyof AppSettings, value: boolean) => {
      updateSetting(key, value as any);
      await setSetting(key, String(value));
    },
    [updateSetting]
  );

  const handleSaveApiKey = useCallback(async () => {
    updateSetting('openai_api_key', localApiKey);
    await setSetting('openai_api_key', localApiKey);
    Alert.alert('Guardado', 'Clave API guardada correctamente.');
  }, [localApiKey]);

  const handleTestAI = useCallback(async () => {
    if (!localApiKey) {
      Alert.alert('Error', 'Ingresa una clave API primero.');
      return;
    }
    setTestingAI(true);
    const ok = await testOpenAIConnection(localApiKey);
    setTestingAI(false);
    Alert.alert(
      ok ? 'Conexión exitosa' : 'Error de conexión',
      ok ? 'La clave API de OpenAI es válida.' : 'No se pudo conectar. Verifica la clave.'
    );
  }, [localApiKey]);

  const handleDisconnectAccount = useCallback(
    (accountId: string, email: string) => {
      Alert.alert(
        'Desconectar cuenta',
        `¿Quieres desconectar ${email}? Los documentos descargados se conservarán.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Desconectar',
            style: 'destructive',
            onPress: async () => {
              await deleteAccount(accountId);
              removeAccount(accountId);
            },
          },
        ]
      );
    },
    [removeAccount]
  );

  const handleClearAllDocuments = useCallback(() => {
    Alert.alert(
      'Eliminar todos los documentos',
      'Esta acción eliminará TODOS los documentos descargados del dispositivo. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar todo',
          style: 'destructive',
          onPress: async () => {
            try {
              await FileSystem.deleteAsync(ATTACHMENT_DIR, { idempotent: true });
              await FileSystem.makeDirectoryAsync(ATTACHMENT_DIR, { intermediates: true });
              loadStorage();
              Alert.alert('Listo', 'Todos los documentos han sido eliminados.');
            } catch (err) {
              Alert.alert('Error', 'No se pudieron eliminar los documentos.');
            }
          },
        },
      ]
    );
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.screenTitle}>Ajustes</Text>

        {/* Accounts */}
        <SectionHeader title="Cuentas" />
        {accounts.map((account) => (
          <View key={account.id} style={styles.accountCard}>
            <Avatar name={account.displayName} url={account.avatarUrl} size={44} />
            <View style={styles.accountInfo}>
              <View style={styles.accountNameRow}>
                <Text style={styles.accountName}>{account.displayName ?? account.email}</Text>
                <ProviderBadge provider={account.provider} />
              </View>
              <Text style={styles.accountEmail}>{account.email}</Text>
              {account.lastSyncAt && (
                <Text style={styles.lastSync}>
                  Sincronizado {formatDistanceToNow(account.lastSyncAt, { locale: es, addSuffix: true })}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => handleDisconnectAccount(account.id, account.email)}
              style={styles.disconnectBtn}
            >
              <MaterialCommunityIcons name="link-off" size={20} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        ))}

        {/* Sync Settings */}
        <SectionHeader title="Sincronización" />
        <SettingsCard>
          <ToggleRow
            label="Sincronizar al abrir la app"
            value={settings?.sync_on_open ?? true}
            onChange={(v) => handleToggle('sync_on_open', v)}
          />
          <Divider />
          <ToggleRow
            label="Notificar al encontrar documentos"
            value={settings?.notify_on_new_docs ?? true}
            onChange={(v) => handleToggle('notify_on_new_docs', v)}
          />
        </SettingsCard>

        {/* AI Settings */}
        <SectionHeader title="Inteligencia Artificial" />
        <SettingsCard>
          <ToggleRow
            label="Categorización con IA"
            value={settings?.ai_categorization_enabled ?? true}
            onChange={(v) => handleToggle('ai_categorization_enabled', v)}
          />
          <Divider />
          <View style={styles.apiKeyRow}>
            <Text style={styles.settingLabel}>Clave API OpenAI</Text>
            <View style={styles.apiKeyInput}>
              <TextInput
                style={styles.apiKeyTextField}
                value={localApiKey}
                onChangeText={setLocalApiKey}
                placeholder="sk-..."
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!apiKeyVisible}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setApiKeyVisible(!apiKeyVisible)}>
                <Ionicons
                  name={apiKeyVisible ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.apiKeyActions}>
              <Button label="Guardar" onPress={handleSaveApiKey} size="sm" variant="outline" />
              <Button
                label={testingAI ? 'Probando...' : 'Probar conexión'}
                onPress={handleTestAI}
                size="sm"
                loading={testingAI}
              />
            </View>
          </View>
        </SettingsCard>

        {/* Storage */}
        <SectionHeader title="Almacenamiento" />
        <SettingsCard>
          <View style={styles.storageRow}>
            <MaterialCommunityIcons name="database-outline" size={20} color={Colors.primary} />
            <View style={styles.storageInfo}>
              <Text style={styles.settingLabel}>Uso de InboxDocs</Text>
              <Text style={styles.storageValue}>
                {formatBytes(storageUsed)} — {totalDocs} documento{totalDocs !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
          <Divider />
          <TouchableOpacity style={styles.dangerRow} onPress={handleClearAllDocuments}>
            <MaterialCommunityIcons name="delete-sweep-outline" size={20} color={Colors.danger} />
            <Text style={styles.dangerText}>Eliminar todos los documentos</Text>
          </TouchableOpacity>
        </SettingsCard>

        {/* About */}
        <SectionHeader title="Acerca de" />
        <SettingsCard>
          <View style={styles.aboutRow}>
            <Text style={styles.settingLabel}>Versión</Text>
            <Text style={styles.settingValue}>{VERSION}</Text>
          </View>
        </SettingsCard>

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Divider() {
  return <View style={styles.divider} />;
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.border, true: Colors.primaryLight }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, paddingHorizontal: Spacing.base },
  screenTitle: { ...Typography.headingL, color: Colors.textPrimary, marginTop: Spacing.base, marginBottom: Spacing.sm },
  sectionHeader: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.subtle,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.base },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    ...Shadows.subtle,
  },
  accountInfo: { flex: 1 },
  accountNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  accountName: { ...Typography.bodyM, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  accountEmail: { ...Typography.caption, color: Colors.textMuted },
  lastSync: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  disconnectBtn: { padding: Spacing.sm },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  settingLabel: { ...Typography.bodyM, color: Colors.textPrimary },
  settingValue: { ...Typography.bodyM, color: Colors.textSecondary },
  apiKeyRow: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  apiKeyInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  apiKeyTextField: {
    flex: 1,
    ...Typography.bodyM,
    color: Colors.textPrimary,
    padding: 0,
  },
  apiKeyActions: { flexDirection: 'row', gap: Spacing.sm },
  storageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  storageInfo: { flex: 1 },
  storageValue: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  dangerText: { ...Typography.bodyM, color: Colors.danger },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
});
