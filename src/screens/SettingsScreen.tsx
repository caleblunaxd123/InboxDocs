import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../utils/theme';
import { useTheme } from '../utils/useTheme';
import { useAppStore } from '../store/useAppStore';
import { Avatar } from '../components/ui/Avatar';
import { ProviderBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { getAllSettings, setSetting } from '../database/settings';
import { deleteAccount, upsertAccount } from '../database/accounts';
import { testOpenAIConnection } from '../services/aiService';
import { signInWithGoogle, signInWithMicrosoft } from '../services/authService';
import { AppSettings, Account } from '../types';
import * as FileSystem from 'expo-file-system/legacy';
import { getDocumentStats, deleteAllDocuments } from '../database/documents';
import { exportDocumentsCsv } from '../utils/exportCsv';
import { formatBytes } from '../utils/format';
import { v4 as uuidv4 } from 'uuid';
import * as LocalAuthentication from 'expo-local-authentication';
import { ATTACHMENT_DIR } from '../constants';
const VERSION = '1.0.0';

const RANGE_OPTIONS = [
  { label: 'Últimos 30 días', days: 30 },
  { label: 'Últimos 3 meses', days: 90 },
  { label: 'Últimos 6 meses', days: 180 },
  { label: 'Último año', days: 365 },
  { label: 'Todo el historial', days: 365 * 5 },
];

function BiometricToggleRow({ settings, updateSetting }: { settings: AppSettings | null; updateSetting: any }) {
  const theme = useTheme();
  const [available, setAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('Biometría');

  useEffect(() => {
    checkAvailability();
  }, []);

  async function checkAvailability() {
    try {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      setAvailable(has && enrolled);
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType('Face ID / Facial');
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType('Huella dactilar');
      }
    } catch {
      setAvailable(false);
    }
  }

  async function handleToggle(value: boolean) {
    if (value) {
      // Verify biometrics work before enabling
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirma para activar la protección biométrica',
          cancelLabel: 'Cancelar',
          disableDeviceFallback: false,
        });
        if (!result.success) return;
      } catch {
        return;
      }
    }
    await setSetting('biometrics_enabled', value ? 'true' : 'false');
    updateSetting('biometricsEnabled', value);
  }

  return (
    <View style={styles.settingRow}>
      <View style={[styles.rowIcon, { backgroundColor: '#6366F120' }]}>
        <MaterialCommunityIcons name="shield-lock-outline" size={16} color="#6366F1" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.settingLabel, { color: theme.textPrimary }]}>{biometricType}</Text>
        <Text style={[styles.settingDescription, { color: theme.textMuted }]}>
          {available ? 'Bloquea la app al salir' : 'No disponible en este dispositivo'}
        </Text>
      </View>
      <Switch
        value={available && (settings?.biometricsEnabled ?? false)}
        onValueChange={handleToggle}
        disabled={!available}
        trackColor={{ false: '#E5E7EB', true: Colors.primary + '60' }}
        thumbColor={settings?.biometricsEnabled ? Colors.primary : '#9CA3AF'}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const { accounts, removeAccount, updateAccount, settings, setSettings, updateSetting, addAccount, setDocuments, setRecentDocuments, setStats, documents } = useAppStore();
  const [storageUsed, setStorageUsed] = useState(0);
  const [totalDocs, setTotalDocs] = useState(0);
  const [testingAI, setTestingAI] = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [localApiKey, setLocalApiKey] = useState('');
  const [exportingCsv, setExportingCsv] = useState(false);
  const [rangeModalAccount, setRangeModalAccount] = useState<string | null>(null);
  const [addAccountModal, setAddAccountModal] = useState(false);
  const [addingProvider, setAddingProvider] = useState<'gmail' | 'outlook' | null>(null);
  const [pendingNewAccount, setPendingNewAccount] = useState<Account | null>(null);
  const [newAccountRangeModal, setNewAccountRangeModal] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  // Reload storage stats every time the Settings tab gains focus
  useFocusEffect(
    useCallback(() => {
      loadStorage();
    }, [])
  );

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

  const handleToggle = useCallback(async (key: keyof AppSettings, value: boolean) => {
    updateSetting(key, value as any);
    await setSetting(key, String(value));
  }, [updateSetting]);

  const handleSaveApiKey = useCallback(async () => {
    updateSetting('openai_api_key', localApiKey);
    await setSetting('openai_api_key', localApiKey);
    Alert.alert('Guardado', 'Clave API guardada correctamente.');
  }, [localApiKey]);

  const handleTestAI = useCallback(async () => {
    if (!localApiKey) { Alert.alert('Error', 'Ingresa una clave API primero.'); return; }
    setTestingAI(true);
    const ok = await testOpenAIConnection(localApiKey);
    setTestingAI(false);
    Alert.alert(ok ? 'Conexión exitosa' : 'Error de conexión', ok ? 'La clave API de OpenAI es válida.' : 'No se pudo conectar. Verifica la clave.');
  }, [localApiKey]);

  const handleDisconnectAccount = useCallback((accountId: string, email: string) => {
    Alert.alert('Desconectar cuenta', `¿Quieres desconectar ${email}? Los documentos descargados se conservarán.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desconectar', style: 'destructive', onPress: async () => { await deleteAccount(accountId); removeAccount(accountId); } },
    ]);
  }, [removeAccount]);

  const handleChangeSyncRange = useCallback(async (accountId: string, days: number) => {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return;
    const newDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
    const updated = { ...acc, syncFromDate: newDate, lastSyncAt: null };
    await upsertAccount(updated);
    updateAccount(accountId, { syncFromDate: newDate, lastSyncAt: null });
    setRangeModalAccount(null);
    Alert.alert('Listo', 'La próxima sincronización escaneará desde la nueva fecha seleccionada.');
  }, [accounts, updateAccount]);

  const handleAddAccount = useCallback(async (provider: 'gmail' | 'outlook') => {
    setAddingProvider(provider);
    try {
      const result = provider === 'gmail' ? await signInWithGoogle() : await signInWithMicrosoft();
      const existing = accounts.find(a => a.email === result.email);
      if (existing) {
        Alert.alert('Cuenta ya conectada', `${result.email} ya está conectada.`);
        setAddingProvider(null);
        return;
      }
      const newAcc: Account = {
        id: uuidv4(),
        provider,
        email: result.email,
        displayName: result.displayName,
        avatarUrl: result.avatarUrl,
        accessTokenEncrypted: result.accessToken,
        refreshTokenEncrypted: result.refreshToken,
        tokenExpiresAt: result.expiresAt,
        lastSyncAt: null,
        syncFromDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
        isActive: true,
        createdAt: Date.now(),
      };
      setPendingNewAccount(newAcc);
      setNewAccountRangeModal(true);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'No se pudo conectar la cuenta.');
    } finally {
      setAddingProvider(null);
      setAddAccountModal(false);
    }
  }, [accounts]);

  const handleNewAccountRange = useCallback(async (days: number) => {
    if (!pendingNewAccount) return;
    const acc: Account = {
      ...pendingNewAccount,
      syncFromDate: format(subDays(new Date(), days), 'yyyy-MM-dd'),
    };
    await upsertAccount(acc);
    addAccount(acc);
    setPendingNewAccount(null);
    setNewAccountRangeModal(false);
    Alert.alert('¡Cuenta conectada!', `${acc.email} fue agregada correctamente.`);
  }, [pendingNewAccount, addAccount]);

  const handleExportCsv = useCallback(async () => {
    if (documents.length === 0) {
      Alert.alert('Sin documentos', 'No hay documentos para exportar.');
      return;
    }
    setExportingCsv(true);
    try {
      await exportDocumentsCsv(documents);
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo exportar: ' + (e?.message ?? ''));
    } finally {
      setExportingCsv(false);
    }
  }, [documents]);

  const handleClearAllDocuments = useCallback(() => {
    Alert.alert('Eliminar todos los documentos', 'Esta acción eliminará TODOS los documentos descargados. No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar todo', style: 'destructive', onPress: async () => {
          try {
            // 1. Delete all DB records
            await deleteAllDocuments();
            // 2. Delete all physical files
            await FileSystem.deleteAsync(ATTACHMENT_DIR, { idempotent: true });
            await FileSystem.makeDirectoryAsync(ATTACHMENT_DIR, { intermediates: true });
            // 3. Clear in-memory store so lists update immediately
            setDocuments([]);
            setRecentDocuments([]);
            setStats(0, 0);
            setTotalDocs(0);
            setStorageUsed(0);
            Alert.alert('Listo', 'Todos los documentos han sido eliminados.');
          } catch (e: any) {
            Alert.alert('Error', 'No se pudieron eliminar los documentos: ' + (e?.message ?? ''));
          }
        }
      },
    ]);
  }, [setDocuments, setRecentDocuments, setStats]);

  const rangeAccount = accounts.find(a => a.id === rangeModalAccount);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={[styles.screenTitle, { color: theme.textPrimary }]}>Ajustes</Text>

        {/* Connected Accounts */}
        <SectionHeader title="Cuentas conectadas" theme={theme} />
        {accounts.map((account) => (
          <View key={account.id} style={[styles.accountCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Avatar name={account.displayName} url={account.avatarUrl} size={44} />
            <View style={styles.accountInfo}>
              <View style={styles.accountNameRow}>
                <Text style={[styles.accountName, { color: theme.textPrimary }]} numberOfLines={1}>{account.displayName ?? account.email}</Text>
                <ProviderBadge provider={account.provider} />
              </View>
              <Text style={[styles.accountEmail, { color: theme.textMuted }]}>{account.email}</Text>
              <TouchableOpacity style={styles.syncFromRow} onPress={() => setRangeModalAccount(account.id)}>
                <MaterialCommunityIcons name="calendar-range" size={12} color={Colors.primary} />
                <Text style={[styles.syncFromText, { color: theme.primary }]}>Desde: {account.syncFromDate} · Cambiar</Text>
              </TouchableOpacity>
              {account.lastSyncAt && (
                <Text style={[styles.lastSync, { color: theme.textMuted }]}>
                  Sync: {format(account.lastSyncAt, "dd/MM/yy 'a las' HH:mm", { locale: es })}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => handleDisconnectAccount(account.id, account.email)} style={styles.disconnectBtn}>
              <MaterialCommunityIcons name="link-off" size={20} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        ))}

        {/* Add Account Button */}
        <TouchableOpacity style={[styles.addAccountBtn, { backgroundColor: theme.surface, borderColor: theme.primary + '40' }]} onPress={() => setAddAccountModal(true)}>
          <View style={[styles.addAccountIcon, { backgroundColor: theme.primarySubtle }]}>
            <MaterialCommunityIcons name="plus" size={18} color={theme.primary} />
          </View>
          <Text style={[styles.addAccountText, { color: theme.primary }]}>Añadir otra cuenta</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={theme.textMuted} />
        </TouchableOpacity>

        {/* Appearance */}
        <SectionHeader title="Apariencia" theme={theme} />
        <SettingsCard theme={theme}>
          <View style={styles.themeRow}>
            <View style={[styles.rowIcon, { backgroundColor: '#8B5CF620' }]}>
              <MaterialCommunityIcons name="theme-light-dark" size={16} color="#8B5CF6" />
            </View>
            <Text style={[styles.settingLabel, { flex: 1, color: theme.textPrimary }]}>Tema</Text>
            <View style={styles.themeOptions}>
              {(['light', 'system', 'dark'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.themeOption, { borderColor: theme.border, backgroundColor: theme.surface }, settings?.theme === t && styles.themeOptionActive]}
                  onPress={async () => {
                    updateSetting('theme', t);
                    await setSetting('theme', t);
                  }}
                >
                  <MaterialCommunityIcons
                    name={t === 'light' ? 'weather-sunny' : t === 'dark' ? 'weather-night' : 'theme-light-dark'}
                    size={16}
                    color={settings?.theme === t ? Colors.surface : theme.textSecondary}
                  />
                  <Text style={[styles.themeOptionText, { color: theme.textSecondary }, settings?.theme === t && styles.themeOptionTextActive]}>
                    {t === 'light' ? 'Claro' : t === 'dark' ? 'Oscuro' : 'Sistema'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </SettingsCard>

        {/* Security */}
        <SectionHeader title="Seguridad" theme={theme} />
        <SettingsCard theme={theme}>
          <BiometricToggleRow settings={settings} updateSetting={updateSetting} />
        </SettingsCard>

        {/* Sync Settings */}
        <SectionHeader title="Sincronización" theme={theme} />
        <SettingsCard theme={theme}>
          <ToggleRow
            icon="sync" iconColor="#10B981"
            label="Sincronizar al abrir la app"
            value={settings?.sync_on_open ?? true}
            onChange={(v) => handleToggle('sync_on_open', v)}
            theme={theme}
          />
          <Divider theme={theme} />
          <ToggleRow
            icon="bell-outline" iconColor="#F59E0B"
            label="Notificar al encontrar documentos"
            value={settings?.notify_on_new_docs ?? true}
            onChange={(v) => handleToggle('notify_on_new_docs', v)}
            theme={theme}
          />
        </SettingsCard>

        {/* AI Settings */}
        <SectionHeader title="Inteligencia Artificial" theme={theme} />
        <SettingsCard theme={theme}>
          <ToggleRow
            icon="robot-outline" iconColor="#8B5CF6"
            label="Categorización con IA"
            value={settings?.ai_categorization_enabled ?? true}
            onChange={(v) => handleToggle('ai_categorization_enabled', v)}
            theme={theme}
          />
          <Divider theme={theme} />
          <View style={styles.apiKeyRow}>
            <View style={styles.apiKeyLabelRow}>
              <View style={[styles.rowIcon, { backgroundColor: '#8B5CF620' }]}>
                <MaterialCommunityIcons name="key-outline" size={16} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: theme.textPrimary }]}>Clave API OpenAI</Text>
                <Text style={[styles.settingHint, { color: theme.textMuted }]}>Sin clave se usa categorización por palabras clave (gratis)</Text>
              </View>
            </View>
            <View style={[styles.apiKeyInput, { borderColor: theme.border }]}>
              <TextInput style={[styles.apiKeyTextField, { color: theme.textPrimary }]} value={localApiKey} onChangeText={setLocalApiKey} placeholder="sk-... (opcional)" placeholderTextColor={theme.textMuted} secureTextEntry={!apiKeyVisible} autoCapitalize="none" autoCorrect={false} />
              <TouchableOpacity onPress={() => setApiKeyVisible(!apiKeyVisible)}>
                <Ionicons name={apiKeyVisible ? 'eye-off-outline' : 'eye-outline'} size={18} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.apiKeyActions}>
              <Button label="Guardar" onPress={handleSaveApiKey} size="sm" variant="outline" />
              <Button label={testingAI ? 'Probando...' : 'Probar'} onPress={handleTestAI} size="sm" loading={testingAI} />
            </View>
          </View>
        </SettingsCard>

        {/* Storage */}
        <SectionHeader title="Almacenamiento local" theme={theme} />
        <SettingsCard theme={theme}>
          <View style={styles.storageRow}>
            <View style={[styles.rowIcon, { backgroundColor: '#2563EB18' }]}>
              <MaterialCommunityIcons name="database-outline" size={18} color={theme.primary} />
            </View>
            <View style={styles.storageInfo}>
              <Text style={[styles.settingLabel, { color: theme.textPrimary }]}>Uso de InboxDocs</Text>
              <Text style={[styles.storageValue, { color: theme.textMuted }]}>{formatBytes(storageUsed)} · {totalDocs} documento{totalDocs !== 1 ? 's' : ''}</Text>
            </View>
          </View>
          <Divider theme={theme} />
          <TouchableOpacity style={styles.exportRow} onPress={handleExportCsv} disabled={totalDocs === 0 || exportingCsv}>
            <View style={[styles.rowIcon, { backgroundColor: '#10B98118' }]}>
              {exportingCsv
                ? <ActivityIndicator size="small" color="#10B981" />
                : <MaterialCommunityIcons name="export-variant" size={18} color="#10B981" />
              }
            </View>
            <Text style={[styles.exportText, totalDocs === 0 && { color: theme.textMuted }]}>
              Exportar lista como CSV
            </Text>
          </TouchableOpacity>
          <Divider theme={theme} />
          <TouchableOpacity style={styles.dangerRow} onPress={handleClearAllDocuments}>
            <View style={[styles.rowIcon, { backgroundColor: '#EF444420' }]}>
              <MaterialCommunityIcons name="delete-sweep-outline" size={18} color={Colors.danger} />
            </View>
            <Text style={styles.dangerText}>Eliminar todos los documentos</Text>
          </TouchableOpacity>
        </SettingsCard>

        {/* About */}
        <SectionHeader title="Acerca de" theme={theme} />
        <SettingsCard theme={theme}>
          <View style={styles.aboutRow}>
            <View style={[styles.rowIcon, { backgroundColor: '#10B98118' }]}>
              <MaterialCommunityIcons name="information-outline" size={18} color="#10B981" />
            </View>
            <Text style={[styles.settingLabel, { color: theme.textPrimary }]}>Versión</Text>
            <Text style={[styles.settingValue, { color: theme.textSecondary }]}>{VERSION}</Text>
          </View>
          <Divider theme={theme} />
          <View style={styles.aboutRow}>
            <View style={[styles.rowIcon, { backgroundColor: '#06B6D418' }]}>
              <MaterialCommunityIcons name="shield-check-outline" size={18} color="#06B6D4" />
            </View>
            <Text style={[styles.settingLabel, { color: theme.textPrimary }]}>Almacenamiento</Text>
            <Text style={[styles.settingValue, { color: theme.textSecondary }]}>100% local</Text>
          </View>
        </SettingsCard>

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>

      {/* Sync Range Modal */}
      <Modal visible={!!rangeModalAccount} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
            <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
            <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>¿Desde cuándo sincronizar?</Text>
            <Text style={[styles.sheetSub, { color: theme.textMuted }]}>{rangeAccount?.email}</Text>
            {RANGE_OPTIONS.map((opt) => (
              <TouchableOpacity key={opt.days} style={[styles.rangeOption, { borderColor: theme.border }]} onPress={() => rangeModalAccount && handleChangeSyncRange(rangeModalAccount, opt.days)} activeOpacity={0.75}>
                <MaterialCommunityIcons name="calendar-range" size={18} color={theme.primary} />
                <Text style={[styles.rangeLabel, { color: theme.textPrimary }]}>{opt.label}</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color={theme.textMuted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.sheetCancel, { borderTopColor: theme.border }]} onPress={() => setRangeModalAccount(null)}>
              <Text style={[styles.sheetCancelText, { color: theme.textSecondary }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Account Modal */}
      <Modal visible={addAccountModal} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
            <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
            <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>Añadir cuenta</Text>
            <Text style={[styles.sheetSub, { color: theme.textMuted }]}>Conecta una cuenta de correo adicional</Text>

            <TouchableOpacity
              style={[styles.providerBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
              onPress={() => handleAddAccount('gmail')}
              disabled={addingProvider !== null}
              activeOpacity={0.8}
            >
              {addingProvider === 'gmail' ? (
                <ActivityIndicator size="small" color="#EA4335" />
              ) : (
                <MaterialCommunityIcons name="gmail" size={22} color="#EA4335" />
              )}
              <Text style={[styles.providerBtnText, { color: theme.textPrimary }]}>Conectar Gmail</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.providerBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
              onPress={() => handleAddAccount('outlook')}
              disabled={addingProvider !== null}
              activeOpacity={0.8}
            >
              {addingProvider === 'outlook' ? (
                <ActivityIndicator size="small" color="#0078D4" />
              ) : (
                <MaterialCommunityIcons name="microsoft-outlook" size={22} color="#0078D4" />
              )}
              <Text style={[styles.providerBtnText, { color: theme.textPrimary }]}>Conectar Outlook</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.sheetCancel, { borderTopColor: theme.border }]} onPress={() => setAddAccountModal(false)}>
              <Text style={[styles.sheetCancelText, { color: theme.textSecondary }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* New Account Range Modal */}
      <Modal visible={newAccountRangeModal} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
            <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
            <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>¿Desde cuándo importar?</Text>
            <Text style={[styles.sheetSub, { color: theme.textMuted }]}>{pendingNewAccount?.email}</Text>
            {RANGE_OPTIONS.map((opt) => (
              <TouchableOpacity key={opt.days} style={[styles.rangeOption, { borderColor: theme.border }]} onPress={() => handleNewAccountRange(opt.days)} activeOpacity={0.75}>
                <MaterialCommunityIcons name="calendar-range" size={18} color={theme.primary} />
                <Text style={[styles.rangeLabel, { color: theme.textPrimary }]}>{opt.label}</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color={theme.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SectionHeader({ title, theme }: { title: string; theme: any }) {
  return <Text style={[styles.sectionHeader, { color: theme.textMuted }]}>{title}</Text>;
}
function SettingsCard({ children, theme }: { children: React.ReactNode; theme: any }) {
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>{children}</View>;
}
function Divider({ theme }: { theme: any }) {
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}
function ToggleRow({ label, value, onChange, icon, iconColor, theme }: {
  label: string; value: boolean; onChange: (v: boolean) => void; icon: string; iconColor: string; theme: any;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={[styles.rowIcon, { backgroundColor: iconColor + '20' }]}>
        <MaterialCommunityIcons name={icon as any} size={16} color={iconColor} />
      </View>
      <Text style={[styles.settingLabel, { flex: 1, color: theme.textPrimary }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: theme.border, true: Colors.primaryLight }} thumbColor="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, paddingHorizontal: Spacing.base },
  screenTitle: { ...Typography.headingL, color: Colors.textPrimary, marginTop: Spacing.base, marginBottom: Spacing.sm },
  sectionHeader: { ...Typography.caption, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: Spacing.xl, marginBottom: Spacing.sm, marginLeft: Spacing.xs },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.card, borderWidth: 1, borderColor: Colors.border, ...Shadows.subtle, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.base },
  accountCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.surface, borderRadius: BorderRadius.card, borderWidth: 1, borderColor: Colors.border, padding: Spacing.base, marginBottom: Spacing.sm, gap: Spacing.md, ...Shadows.subtle },
  accountInfo: { flex: 1 },
  accountNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  accountName: { ...Typography.bodyM, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  accountEmail: { ...Typography.caption, color: Colors.textMuted },
  syncFromRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  syncFromText: { ...Typography.caption, color: Colors.primary },
  lastSync: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  disconnectBtn: { padding: Spacing.sm },
  addAccountBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surface, borderRadius: BorderRadius.card, borderWidth: 1.5, borderColor: Colors.primary + '40', borderStyle: 'dashed', padding: Spacing.base, marginBottom: Spacing.sm },
  addAccountIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primarySubtle, alignItems: 'center', justifyContent: 'center' },
  addAccountText: { ...Typography.bodyM, color: Colors.primary, fontWeight: '500', flex: 1 },
  rowIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.md },
  settingLabel: { ...Typography.bodyM, color: Colors.textPrimary },
  settingHint: { ...Typography.caption, color: Colors.textMuted },
  settingDescription: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.md },
  settingValue: { ...Typography.bodyM, color: Colors.textSecondary },
  apiKeyLabelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.sm },
  apiKeyRow: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.sm },
  apiKeyInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.input, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  apiKeyTextField: { flex: 1, ...Typography.bodyM, color: Colors.textPrimary, padding: 0 },
  apiKeyActions: { flexDirection: 'row', gap: Spacing.sm },
  storageRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.md },
  storageInfo: { flex: 1 },
  storageValue: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  dangerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.md },
  dangerText: { ...Typography.bodyM, color: Colors.danger },
  aboutRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.md },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.xl, paddingBottom: Spacing.xxxl, gap: Spacing.sm },
  sheetHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  sheetTitle: { ...Typography.headingM, color: Colors.textPrimary },
  sheetSub: { ...Typography.caption, color: Colors.textMuted, marginBottom: Spacing.sm },
  rangeOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.input, borderWidth: 1, borderColor: Colors.border },
  rangeLabel: { ...Typography.bodyM, color: Colors.textPrimary, flex: 1 },
  sheetCancel: { alignItems: 'center', paddingVertical: Spacing.md, marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  sheetCancelText: { ...Typography.bodyM, color: Colors.textSecondary },
  providerBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.base, borderRadius: BorderRadius.input, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  providerBtnText: { ...Typography.bodyM, color: Colors.textPrimary, fontWeight: '600' },
  themeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.md },
  themeOptions: { flexDirection: 'row', gap: Spacing.xs },
  themeOption: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: BorderRadius.pill, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  themeOptionActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  themeOptionText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  themeOptionTextActive: { color: Colors.surface },
  exportRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.md },
  exportText: { ...Typography.bodyM, color: '#10B981', fontWeight: '500' },
});
