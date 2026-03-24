import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  Animated,
  Easing,
  Modal,
} from 'react-native';
import { Account, Document } from '../types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { format, formatDistanceToNow, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../utils/theme';
import { useTheme } from '../utils/useTheme';
import { useAppStore } from '../store/useAppStore';
import { Avatar } from '../components/ui/Avatar';
import { CategoryBadge, ProviderBadge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { getAllAccounts, updateAccountTokens } from '../database/accounts';
import { getRecentDocuments, getDocumentStats, getStarredDocuments } from '../database/documents';
import { signInWithGoogle, signInWithMicrosoft } from '../services/authService';
import { syncGmailAccount, syncOutlookAccount } from '../services/syncService';
import { scheduleNewDocumentsNotification } from '../services/notificationService';
import { formatBytes } from '../utils/format';
import { getFileTypeUI } from '../utils/fileTypes';
import { SyncProgressOverlay } from '../components/ui/SyncProgressOverlay';

export default function HomeScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const {
    accounts,
    recentDocuments,
    starredDocuments,
    totalDocuments,
    totalSizeBytes,
    syncState,
    setSyncState,
    setRecentDocuments,
    setStarredDocuments,
    setStats,
    settings,
    updateAccount,
    updateSetting,
  } = useAppStore();

  const [refreshing, setRefreshing] = React.useState(false);
  const [syncRangeModal, setSyncRangeModal] = React.useState<string | null>(null);
  const [syncFromDate, setSyncFromDate] = React.useState<Date>(subDays(new Date(), 30));
  const [syncToDate, setSyncToDate] = React.useState<Date>(new Date());
  const [showFromPicker, setShowFromPicker] = React.useState(false);
  const [showToPicker, setShowToPicker] = React.useState(false);
  const [syncFileTypes, setSyncFileTypes] = React.useState<Record<string, boolean>>({
    pdf: true,
    images: true,
    word: true,
    excel: true,
    xml: true,
  });

  const loadData = useCallback(async () => {
    const [recent, starred, stats] = await Promise.all([
      getRecentDocuments(10),
      getStarredDocuments(20),
      getDocumentStats(),
    ]);
    setRecentDocuments(recent);
    setStarredDocuments(starred);
    setStats(stats.total, stats.totalSize);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const handleSyncAccount = useCallback(
    async (accountId: string, accountOverride?: Account) => {
      // Guard: prevent double sync
      if (useAppStore.getState().syncState[accountId]?.isSyncing) return;

      // Use override (fresh account) if provided, else find in store
      const account = accountOverride ?? accounts.find((a) => a.id === accountId);
      if (!account) return;

      setSyncState(accountId, {
        isSyncing: true,
        progress: 'Iniciando sincronización...',
        emailsScanned: 0,
        documentsFound: 0,
      });

      try {
        const syncFn = account.provider === 'gmail' ? syncGmailAccount : syncOutlookAccount;
        const downloaded = await syncFn(account, (p) => {
          setSyncState(accountId, {
            progress: p.currentAction,
            emailsScanned: p.emailsScanned,
            documentsFound: p.documentsFound,
          });
        });

        setSyncState(accountId, { isSyncing: false, lastSyncAt: Date.now() });
        updateAccount(accountId, { lastSyncAt: Date.now() });
        await loadData();

        Alert.alert(
          'Sincronización completada',
          downloaded > 0
            ? `Se descargaron ${downloaded} documento(s) nuevo(s).`
            : 'No se encontraron documentos nuevos.'
        );

        if (downloaded > 0) {
          await scheduleNewDocumentsNotification(downloaded);
        }
      } catch (err: any) {
        setSyncState(accountId, { isSyncing: false });
        if (err.code === 'SESSION_EXPIRED') {
          Alert.alert(
            'Sesión expirada',
            err.message,
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Reconectar', onPress: () => handleReconnectAccount(accountId) },
            ]
          );
        } else {
          Alert.alert('Error de sincronización', err.message ?? 'No se pudo completar la sincronización.');
        }
      }
    },
    [accounts, loadData]
  );

  const handleReconnectAccount = useCallback(async (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;
    try {
      const result = account.provider === 'gmail'
        ? await signInWithGoogle()
        : await signInWithMicrosoft();

      await updateAccountTokens(accountId, result.accessToken, result.refreshToken, result.expiresAt);
      updateAccount(accountId, {
        accessTokenEncrypted: result.accessToken,
        refreshTokenEncrypted: result.refreshToken,
        tokenExpiresAt: result.expiresAt,
      });

      // Build fresh account to avoid stale closure — sync directly
      const freshAccount = {
        ...account,
        accessTokenEncrypted: result.accessToken,
        refreshTokenEncrypted: result.refreshToken,
        tokenExpiresAt: result.expiresAt,
      };

      setSyncState(accountId, { isSyncing: true, progress: 'Reconectado — iniciando sync...', emailsScanned: 0, documentsFound: 0 });
      const syncFn = freshAccount.provider === 'gmail' ? syncGmailAccount : syncOutlookAccount;
      const downloaded = await syncFn(freshAccount, (p) => {
        setSyncState(accountId, { progress: p.currentAction, emailsScanned: p.emailsScanned, documentsFound: p.documentsFound });
      });
      setSyncState(accountId, { isSyncing: false, lastSyncAt: Date.now() });
      updateAccount(accountId, { lastSyncAt: Date.now() });
      await loadData();
      Alert.alert(
        'Sincronización completada',
        downloaded > 0 ? `Se descargaron ${downloaded} documento(s) nuevo(s).` : 'No se encontraron documentos nuevos.'
      );
    } catch (err: any) {
      setSyncState(accountId, { isSyncing: false });
      Alert.alert('Error al reconectar', err.message ?? 'No se pudo reconectar la cuenta.');
    }
  }, [accounts, updateAccount, setSyncState, loadData]);

  const handleSyncAll = useCallback(async () => {
    for (const account of accounts) {
      await handleSyncAccount(account.id);
    }
  }, [accounts, handleSyncAccount]);

  const handleSyncWithCustomRange = useCallback(async (accountId: string) => {
    setSyncRangeModal(null);
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return;

    const newFromDate = format(syncFromDate, 'yyyy-MM-dd');
    // Build allowed extensions from syncFileTypes
    const extMap: Record<string, string[]> = {
      pdf: ['pdf'],
      images: ['jpg', 'jpeg', 'png', 'heic', 'webp'],
      word: ['docx'],
      excel: ['xlsx'],
      xml: ['xml', 'txt'],
    };
    const allowedExts = Object.entries(syncFileTypes)
      .filter(([, enabled]) => enabled)
      .flatMap(([key]) => extMap[key] ?? []);

    // Update allowed_extensions in DB settings
    await import('../database/settings').then(m => m.setSetting('allowed_extensions', JSON.stringify(allowedExts)));
    // Update in store too
    if (settings) updateSetting('allowedExtensions' as any, allowedExts as any);

    const freshAccount = { ...acc, syncFromDate: newFromDate, lastSyncAt: null };
    updateAccount(accountId, { syncFromDate: newFromDate, lastSyncAt: null });
    await import('../database/accounts').then(m => m.upsertAccount(freshAccount));

    await handleSyncAccount(accountId, freshAccount);
  }, [accounts, syncFromDate, syncFileTypes, handleSyncAccount, updateAccount, settings]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const isSyncingAny = accounts.some((a) => syncState[a.id]?.isSyncing);
  const syncingAccountState = Object.values(syncState).find((s) => s?.isSyncing);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <SyncProgressOverlay
        visible={isSyncingAny}
        progress={syncingAccountState?.progress ?? ''}
        emailsScanned={syncingAccountState?.emailsScanned ?? 0}
        documentsFound={syncingAccountState?.documentsFound ?? 0}
      />
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <View style={styles.logoIcon}>
              <MaterialCommunityIcons name="inbox-arrow-down" size={20} color="#fff" />
            </View>
            <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>InboxDocs</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <FadeInUpView delay={100} style={[styles.statsRow, { backgroundColor: theme.surface }]}>
          <StatItem icon="file-multiple-outline" label="Documentos" value={String(totalDocuments)} />
          <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
          <StatItem icon="database-outline" label="Almacenado" value={formatBytes(totalSizeBytes)} />
          <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
          <StatItem icon="account-multiple-outline" label="Cuentas" value={String(accounts.length)} />
        </FadeInUpView>

        {/* First-use banner: shown only when connected but never synced */}
        {totalDocuments === 0 && accounts.some(a => a.lastSyncAt === null) && (
          <FadeInUpView delay={150}>
            <View style={[styles.firstUseBanner, { borderColor: theme.primary + '40', backgroundColor: theme.primary + '10' }]}>
              <View style={[styles.firstUseBannerIconWrap, { backgroundColor: theme.primary + '20' }]}>
                <MaterialCommunityIcons name="rocket-launch-outline" size={22} color={theme.primary} />
              </View>
              <View style={styles.firstUseBannerBody}>
                <Text style={[styles.firstUseBannerTitle, { color: theme.textPrimary }]}>
                  ¡Cuenta conectada!
                </Text>
                <Text style={[styles.firstUseBannerText, { color: theme.textSecondary }]}>
                  Pulsa "Sincronizar ahora" para importar tus documentos
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-down" size={20} color={theme.primary} />
            </View>
          </FadeInUpView>
        )}

        {/* Accounts Section */}
        <FadeInUpView delay={200}>
          <SectionHeader title="Cuentas Conectadas" />
        </FadeInUpView>
        
        {accounts.map((account, index) => {
          const state = syncState[account.id];
          return (
            <FadeInUpView delay={250 + index * 50} key={account.id}>
              <Card style={styles.accountCard}>
              <View style={styles.accountRow}>
                <Avatar name={account.displayName} url={account.avatarUrl} size={44} />
                <View style={styles.accountInfo}>
                  <View style={styles.accountNameRow}>
                    <Text style={[styles.accountName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {account.displayName ?? account.email}
                    </Text>
                    <ProviderBadge provider={account.provider} />
                  </View>
                  <Text style={[styles.accountEmail, { color: theme.textMuted }]} numberOfLines={1}>{account.email}</Text>
                  <View style={styles.syncStatusRow}>
                    <View
                      style={[
                        styles.syncDot,
                        { backgroundColor: state?.isSyncing ? Colors.warning : Colors.success },
                      ]}
                    />
                    <Text style={[styles.syncStatusText, { color: theme.textSecondary }]}>
                      {state?.isSyncing
                        ? state.progress
                        : account.lastSyncAt
                        ? `Sync: ${format(account.lastSyncAt, "dd/MM/yy 'a las' HH:mm", { locale: es })}`
                        : 'Nunca sincronizado'}
                    </Text>
                  </View>
                </View>
                <SyncIconButton
                  isSyncing={!!state?.isSyncing}
                  onPress={() => setSyncRangeModal(account.id)}
                />
              </View>
            </Card>
            </FadeInUpView>
          );
        })}

        {/* Sync Now Button */}
        <Button
          label={isSyncingAny ? 'Sincronizando...' : 'Sincronizar ahora'}
          onPress={handleSyncAll}
          loading={isSyncingAny}
          size="lg"
          style={styles.syncNowBtn}
          icon={
            !isSyncingAny ? (
              <MaterialCommunityIcons name="sync" size={20} color="#fff" />
            ) : undefined
          }
        />

        {/* Recent Documents */}
        <View style={styles.recentHeader}>
          <SectionHeader title="Añadidos recientemente" />
          <TouchableOpacity onPress={() => navigation.navigate('Repository')}>
            <Text style={[styles.seeAll, { color: theme.primary }]}>Ver todo</Text>
          </TouchableOpacity>
        </View>

        {recentDocuments.length === 0 ? (
          <EmptyState
            icon="inbox-outline"
            title="Sin documentos aún"
            subtitle="Toca Sincronizar ahora para comenzar"
          />
        ) : (
          <FadeInUpView delay={400}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.recentScroll}
            >
              {recentDocuments.map((doc) => (
                <RecentDocCard
                  key={doc.id}
                  doc={doc}
                  onPress={() => navigation.navigate('DocumentDetail', { documentId: doc.id })}
                />
              ))}
            </ScrollView>
          </FadeInUpView>
        )}

        {/* Starred Documents */}
        {starredDocuments.length > 0 && (
          <FadeInUpView delay={500}>
            <View style={styles.recentHeader}>
              <View style={styles.starredTitleRow}>
                <Ionicons name="star" size={16} color={Colors.warning} />
                <SectionHeader title="Destacados" />
              </View>
              <TouchableOpacity onPress={() => { navigation.navigate('Repository'); }}>
                <Text style={[styles.seeAll, { color: theme.primary }]}>Ver todo</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.recentScroll}
            >
              {starredDocuments.map((doc) => (
                <RecentDocCard
                  key={doc.id}
                  doc={doc}
                  onPress={() => navigation.navigate('DocumentDetail', { documentId: doc.id })}
                  starred
                />
              ))}
            </ScrollView>
          </FadeInUpView>
        )}

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>

      {/* Sync Range Modal */}
      <Modal
        visible={!!syncRangeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setSyncRangeModal(null)}
      >
        <View style={styles.syncModalOverlay}>
          <View style={[styles.syncModalSheet, { backgroundColor: theme.surface }]}>
            {/* Handle */}
            <View style={[styles.syncModalHandle, { backgroundColor: theme.border }]} />

            <Text style={[styles.syncModalTitle, { color: theme.textPrimary }]}>Configurar sincronización</Text>

            {/* Quick presets */}
            <Text style={[styles.syncSectionLabel, { color: theme.textSecondary }]}>RANGO RÁPIDO</Text>
            <View style={styles.syncPresetRow}>
              {[
                { label: '7 días', days: 7 },
                { label: '30 días', days: 30 },
                { label: '3 meses', days: 90 },
                { label: '1 año', days: 365 },
              ].map((p) => (
                <TouchableOpacity
                  key={p.days}
                  style={[styles.syncPresetChip, { borderColor: theme.primary, backgroundColor: theme.primarySubtle }]}
                  onPress={() => {
                    setSyncFromDate(subDays(new Date(), p.days));
                    setSyncToDate(new Date());
                  }}
                >
                  <Text style={[styles.syncPresetChipText, { color: theme.primary }]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom date range */}
            <Text style={[styles.syncSectionLabel, { color: theme.textSecondary }]}>RANGO PERSONALIZADO</Text>
            <View style={[styles.syncDateRow, { borderColor: theme.border }]}>
              <TouchableOpacity style={styles.syncDateField} onPress={() => setShowFromPicker(true)}>
                <MaterialCommunityIcons name="calendar-start" size={16} color={theme.primary} />
                <Text style={[styles.syncDateLabel, { color: theme.textSecondary }]}>Desde</Text>
                <Text style={[styles.syncDateValue, { color: theme.textPrimary }]}>{format(syncFromDate, 'dd/MM/yyyy')}</Text>
              </TouchableOpacity>
              <View style={[styles.syncDateDivider, { backgroundColor: theme.border }]} />
              <TouchableOpacity style={styles.syncDateField} onPress={() => setShowToPicker(true)}>
                <MaterialCommunityIcons name="calendar-end" size={16} color={theme.primary} />
                <Text style={[styles.syncDateLabel, { color: theme.textSecondary }]}>Hasta</Text>
                <Text style={[styles.syncDateValue, { color: theme.textPrimary }]}>{format(syncToDate, 'dd/MM/yyyy')}</Text>
              </TouchableOpacity>
            </View>

            {/* File type filter */}
            <Text style={[styles.syncSectionLabel, { color: theme.textSecondary }]}>TIPOS DE ARCHIVO</Text>
            <View style={styles.syncTypeGrid}>
              {[
                { key: 'pdf', label: 'PDF', icon: 'file-pdf-box', color: '#EF4444' },
                { key: 'images', label: 'Imágenes', icon: 'image-outline', color: '#8B5CF6' },
                { key: 'word', label: 'Word', icon: 'file-word-box', color: '#2563EB' },
                { key: 'excel', label: 'Excel', icon: 'file-excel-box', color: '#16A34A' },
                { key: 'xml', label: 'XML / TXT', icon: 'file-code-outline', color: '#F59E0B' },
              ].map((t) => {
                const enabled = syncFileTypes[t.key];
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[
                      styles.syncTypeChip,
                      {
                        borderColor: enabled ? t.color : theme.border,
                        backgroundColor: enabled ? t.color + '18' : theme.background,
                      },
                    ]}
                    onPress={() => setSyncFileTypes(prev => ({ ...prev, [t.key]: !prev[t.key] }))}
                  >
                    <MaterialCommunityIcons name={t.icon as any} size={18} color={enabled ? t.color : theme.textMuted} />
                    <Text style={[styles.syncTypeLabel, { color: enabled ? t.color : theme.textMuted }]}>{t.label}</Text>
                    {enabled && <MaterialCommunityIcons name="check-circle" size={14} color={t.color} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Actions */}
            <View style={styles.syncModalActions}>
              <TouchableOpacity
                style={[styles.syncCancelBtn, { borderColor: theme.border }]}
                onPress={() => setSyncRangeModal(null)}
              >
                <Text style={[styles.syncCancelText, { color: theme.textSecondary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.syncStartBtn, { backgroundColor: theme.primary }]}
                onPress={() => syncRangeModal && handleSyncWithCustomRange(syncRangeModal)}
              >
                <MaterialCommunityIcons name="sync" size={16} color="#fff" />
                <Text style={styles.syncStartText}>Sincronizar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

      </Modal>

      {/* DateTimePicker for FROM date - outside syncRangeModal to avoid nested modal issue on Android */}
      {showFromPicker && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowFromPicker(false)}>
          <View style={styles.datePickerOverlay}>
            <View style={[styles.datePickerCard, { backgroundColor: theme.surface }]}>
              <Text style={[styles.datePickerTitle, { color: theme.textPrimary }]}>Fecha desde</Text>
              {/* Date display */}
              <View style={styles.datePickerManual}>
                {['Año', 'Mes', 'Día'].map((label, idx) => {
                  const parts = [syncFromDate.getFullYear(), syncFromDate.getMonth() + 1, syncFromDate.getDate()];
                  return (
                    <View key={label} style={styles.datePartCol}>
                      <Text style={[styles.datePartLabel, { color: theme.textMuted }]}>{label}</Text>
                      <Text style={[styles.datePartValue, { color: theme.textPrimary, borderColor: theme.border }]}>
                        {String(parts[idx]).padStart(2, '0')}
                      </Text>
                    </View>
                  );
                })}
              </View>
              {/* Quick buttons */}
              <View style={styles.datePickerPresets}>
                {[
                  { label: 'Hace 1 semana', days: 7 },
                  { label: 'Hace 30 días', days: 30 },
                  { label: 'Hace 3 meses', days: 90 },
                  { label: 'Hace 6 meses', days: 180 },
                  { label: 'Hace 1 año', days: 365 },
                ].map(p => (
                  <TouchableOpacity
                    key={p.days}
                    style={[styles.datePresetBtn, { borderColor: theme.border }]}
                    onPress={() => { setSyncFromDate(subDays(new Date(), p.days)); setShowFromPicker(false); }}
                  >
                    <Text style={[styles.datePresetText, { color: theme.textPrimary }]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.datePickerClose, { backgroundColor: theme.primary }]}
                onPress={() => setShowFromPicker(false)}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {showToPicker && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowToPicker(false)}>
          <View style={styles.datePickerOverlay}>
            <View style={[styles.datePickerCard, { backgroundColor: theme.surface }]}>
              <Text style={[styles.datePickerTitle, { color: theme.textPrimary }]}>Fecha hasta</Text>
              <View style={styles.datePickerPresets}>
                {[
                  { label: 'Hoy', days: 0 },
                  { label: 'Hace 1 semana', days: 7 },
                  { label: 'Hace 30 días', days: 30 },
                ].map(p => (
                  <TouchableOpacity
                    key={p.days}
                    style={[styles.datePresetBtn, { borderColor: theme.border }]}
                    onPress={() => { setSyncToDate(subDays(new Date(), p.days)); setShowToPicker(false); }}
                  >
                    <Text style={[styles.datePresetText, { color: theme.textPrimary }]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.datePickerClose, { backgroundColor: theme.primary }]}
                onPress={() => setShowToPicker(false)}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function SectionHeader({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{title}</Text>
  );
}

function FadeInUpView({ children, delay, style }: { children: React.ReactNode; delay: number; style?: any }) {
  const anim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 400,
      delay,
      useNativeDriver: true,
    }).start();
  }, []);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  });

  return (
    <Animated.View style={[style, { opacity: anim, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

function SyncIconButton({ isSyncing, onPress }: { isSyncing: boolean; onPress: () => void }) {
  const rotation = React.useRef(new Animated.Value(0)).current;
  const loopRef = React.useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isSyncing) {
      rotation.setValue(0);
      loopRef.current = Animated.loop(
        Animated.timing(rotation, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      loopRef.current.start();
    } else {
      if (loopRef.current) loopRef.current.stop();
      rotation.setValue(0);
    }
  }, [isSyncing]);

  const rotateZ = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <TouchableOpacity onPress={onPress} disabled={isSyncing} style={styles.syncBtn}>
      <Animated.View style={{ transform: [{ rotateZ }] }}>
        <MaterialCommunityIcons
          name="refresh"
          size={20}
          color={isSyncing ? Colors.textMuted : Colors.primary}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

function StatItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.statItem}>
      <MaterialCommunityIcons name={icon as any} size={18} color={theme.primary} />
      <Text style={[styles.statValue, { color: theme.textPrimary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textMuted }]}>{label}</Text>
    </View>
  );
}

function RecentDocCard({ doc, onPress, starred }: { doc: Document; onPress: () => void; starred?: boolean }) {
  const theme = useTheme();
  const ui = getFileTypeUI(doc.fileExtension);
  const accentColor = starred ? Colors.warning : ui.color;

  return (
    <TouchableOpacity style={[styles.recentCard, { backgroundColor: theme.surface }]} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.recentCardAccent, { backgroundColor: accentColor }]} />
      <View style={styles.recentCardContent}>
        <View style={styles.recentCardTopRow}>
          <View style={[styles.recentCardIcon, { backgroundColor: ui.bgColor }]}>
            <MaterialCommunityIcons name={ui.icon as any} size={22} color={ui.color} />
          </View>
          {starred && <Ionicons name="star" size={13} color={Colors.warning} style={styles.recentStar} />}
          {doc.notes ? <MaterialCommunityIcons name="note-text" size={13} color={theme.textMuted} style={styles.recentStar} /> : null}
        </View>
        <CategoryBadge category={doc.category} size="sm" />
        <Text style={[styles.recentCardName, { color: theme.textPrimary }]} numberOfLines={2}>{doc.originalFilename}</Text>
        <Text style={[styles.recentCardDate, { color: theme.textMuted }]}>
          {format(doc.emailDate, 'dd MMM', { locale: es })}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, paddingHorizontal: Spacing.xl }, // changed to xl for dramatic effect
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  headerTitle: { ...Typography.headingXL, color: Colors.textPrimary },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.card,
    padding: Spacing.base,
    marginBottom: Spacing.xl,
    ...Shadows.subtle,
  },
  firstUseBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: BorderRadius.card,
    borderWidth: 1.5,
    padding: Spacing.base,
    marginBottom: Spacing.xl,
  },
  firstUseBannerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  firstUseBannerBody: {
    flex: 1,
    gap: 2,
  },
  firstUseBannerTitle: {
    ...Typography.bodyM,
    fontWeight: '700',
  },
  firstUseBannerText: {
    ...Typography.caption,
    lineHeight: 16,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { width: 1, backgroundColor: Colors.border },
  statValue: { ...Typography.headingM, color: Colors.textPrimary },
  statLabel: { ...Typography.caption, color: Colors.textMuted },
  sectionTitle: {
    ...Typography.headingM,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  accountCard: { marginBottom: Spacing.sm },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  accountInfo: { flex: 1 },
  accountNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  accountName: { ...Typography.bodyM, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  accountEmail: { ...Typography.caption, color: Colors.textMuted, marginBottom: 4 },
  syncStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  syncDot: { width: 7, height: 7, borderRadius: 4 },
  syncStatusText: { ...Typography.caption, color: Colors.textSecondary },
  syncBtn: { padding: Spacing.sm },
  syncNowBtn: { marginVertical: Spacing.xl },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seeAll: { ...Typography.bodyM, color: Colors.primary, fontWeight: '500' },
  recentScroll: { marginHorizontal: -Spacing.base, paddingLeft: Spacing.base },
  recentCard: {
    width: 140,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.card,
    marginRight: Spacing.sm,
    overflow: 'hidden',
    ...Shadows.subtle,
  },
  recentCardAccent: {
    height: 4,
    width: '100%',
  },
  recentCardContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  recentCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentCardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recentStar: { marginLeft: 2 },
  recentCardName: { ...Typography.caption, color: Colors.textPrimary, fontWeight: '500' },
  recentCardDate: { ...Typography.caption, color: Colors.textMuted },
  starredTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sync modal redesign
  syncModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  syncModalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, maxHeight: '90%' },
  syncModalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  syncModalTitle: { ...Typography.headingS, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  syncSectionLabel: { ...Typography.caption, fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginTop: 4 },

  // Presets
  syncPresetRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  syncPresetChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  syncPresetChipText: { ...Typography.caption, fontWeight: '600' },

  // Date range
  syncDateRow: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
  syncDateField: { flex: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  syncDateDivider: { width: 1 },
  syncDateLabel: { ...Typography.caption, flex: 0 },
  syncDateValue: { ...Typography.bodyM, fontWeight: '600', flex: 1 },

  // File type chips
  syncTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  syncTypeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5 },
  syncTypeLabel: { ...Typography.caption, fontWeight: '600' },

  // Actions
  syncModalActions: { flexDirection: 'row', gap: 12 },
  syncCancelBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  syncCancelText: { ...Typography.bodyM, fontWeight: '600' },
  syncStartBtn: { flex: 2, borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  syncStartText: { color: '#fff', ...Typography.bodyM, fontWeight: '700' },

  // Date pickers
  datePickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  datePickerCard: { borderRadius: 20, padding: 24, gap: 12 },
  datePickerTitle: { ...Typography.headingS, fontWeight: '700', textAlign: 'center' },
  datePickerManual: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  datePartCol: { alignItems: 'center', gap: 4 },
  datePartLabel: { ...Typography.caption },
  datePartValue: { ...Typography.headingM, fontWeight: '700', borderBottomWidth: 2, paddingBottom: 4, minWidth: 50, textAlign: 'center' },
  datePickerPresets: { gap: 8 },
  datePresetBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  datePresetText: { ...Typography.bodyM },
  datePickerClose: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
});
