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
import { Document } from '../types';
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
  } = useAppStore();

  const [refreshing, setRefreshing] = React.useState(false);
  const [syncRangeModal, setSyncRangeModal] = React.useState<string | null>(null);

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

  const handleSyncWithRange = useCallback(async (accountId: string, days: number | null) => {
    setSyncRangeModal(null);
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return;

    // Build fresh account so the sync uses the new date — avoids stale closure issue
    let freshAccount: Account = { ...acc };
    if (days !== null) {
      const newDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
      freshAccount = { ...acc, syncFromDate: newDate, lastSyncAt: null };
      // Persist to store and DB
      updateAccount(accountId, { syncFromDate: newDate, lastSyncAt: null });
      await import('../database/accounts').then(m => m.upsertAccount(freshAccount));
    }

    // Pass freshAccount directly so the correct syncFromDate / lastSyncAt is used
    await handleSyncAccount(accountId, freshAccount);
  }, [accounts, handleSyncAccount, updateAccount]);

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
      <Modal visible={!!syncRangeModal} transparent animationType="slide">
        <View style={styles.syncModalOverlay}>
          <View style={[styles.syncModalSheet, { backgroundColor: theme.surface }]}>
            <View style={[styles.syncModalHandle, { backgroundColor: theme.border }]} />
            <Text style={[styles.syncModalTitle, { color: theme.textPrimary }]}>Sincronizar cuenta</Text>
            <Text style={[styles.syncModalSub, { color: theme.textMuted }]}>{accounts.find(a => a.id === syncRangeModal)?.email}</Text>
            <Text style={[styles.syncModalLabel, { color: theme.textMuted }]}>ESCANEAR DESDE</Text>
            {[
              { label: 'Últimos 7 días', days: 7 },
              { label: 'Últimos 30 días', days: 30 },
              { label: 'Últimos 3 meses', days: 90 },
              { label: 'Último año', days: 365 },
              { label: 'Fecha configurada en ajustes', days: null },
            ].map((opt) => (
              <TouchableOpacity
                key={String(opt.days)}
                style={[styles.syncRangeOption, { borderColor: theme.border }]}
                onPress={() => syncRangeModal && handleSyncWithRange(syncRangeModal, opt.days)}
                activeOpacity={0.75}
              >
                <MaterialCommunityIcons name="calendar-clock" size={18} color={theme.primary} />
                <Text style={[styles.syncRangeLabel, { color: theme.textPrimary }]}>{opt.label}</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color={theme.textMuted} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.syncModalCancel, { borderTopColor: theme.border }]} onPress={() => setSyncRangeModal(null)}>
              <Text style={[styles.syncModalCancelText, { color: theme.textSecondary }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  syncModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  syncModalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.xl, paddingBottom: Spacing.xxxl, gap: Spacing.sm },
  syncModalHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  syncModalTitle: { ...Typography.headingM, color: Colors.textPrimary },
  syncModalSub: { ...Typography.caption, color: Colors.textMuted },
  syncModalLabel: { ...Typography.caption, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5, marginTop: Spacing.sm },
  syncRangeOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.input, borderWidth: 1, borderColor: Colors.border },
  syncRangeLabel: { ...Typography.bodyM, color: Colors.textPrimary, flex: 1 },
  syncModalCancel: { alignItems: 'center', paddingVertical: Spacing.md, marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  syncModalCancelText: { ...Typography.bodyM, color: Colors.textSecondary },
});
