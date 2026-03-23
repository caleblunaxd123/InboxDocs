import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Colors, Spacing, Typography, BorderRadius, Shadows } from '../utils/theme';
import { useAppStore } from '../store/useAppStore';
import { Avatar } from '../components/ui/Avatar';
import { CategoryBadge, ProviderBadge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Document } from '../types';
import { getAllAccounts } from '../database/accounts';
import { getRecentDocuments, getDocumentStats } from '../database/documents';
import { syncGmailAccount, syncOutlookAccount } from '../services/syncService';
import { scheduleNewDocumentsNotification } from '../services/notificationService';
import { formatBytes } from '../utils/format';

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const {
    accounts,
    recentDocuments,
    totalDocuments,
    totalSizeBytes,
    syncState,
    setSyncState,
    setRecentDocuments,
    setStats,
    settings,
  } = useAppStore();

  const [refreshing, setRefreshing] = React.useState(false);

  const loadData = useCallback(async () => {
    const recent = await getRecentDocuments(10);
    setRecentDocuments(recent);
    const stats = await getDocumentStats();
    setStats(stats.total, stats.totalSize);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const handleSyncAccount = useCallback(
    async (accountId: string) => {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) return;

      setSyncState(accountId, { isSyncing: true, progress: 'Iniciando sincronización...' });

      try {
        const syncFn = account.provider === 'gmail' ? syncGmailAccount : syncOutlookAccount;
        const downloaded = await syncFn(account, (p) => {
          setSyncState(accountId, { progress: p.currentAction });
        });

        setSyncState(accountId, { isSyncing: false, lastSyncAt: Date.now() });

        if (downloaded > 0) {
          await scheduleNewDocumentsNotification(downloaded);
          await loadData();
        }
      } catch (err: any) {
        setSyncState(accountId, { isSyncing: false });
        Alert.alert('Error de sincronización', err.message ?? 'No se pudo completar la sincronización.');
      }
    },
    [accounts, loadData]
  );

  const handleSyncAll = useCallback(async () => {
    for (const account of accounts) {
      await handleSyncAccount(account.id);
    }
  }, [accounts, handleSyncAccount]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const isSyncingAny = accounts.some((a) => syncState[a.id]?.isSyncing);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>InboxDocs</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatItem icon="file-multiple-outline" label="Documentos" value={String(totalDocuments)} />
          <View style={styles.statDivider} />
          <StatItem icon="database-outline" label="Almacenado" value={formatBytes(totalSizeBytes)} />
          <View style={styles.statDivider} />
          <StatItem icon="account-multiple-outline" label="Cuentas" value={String(accounts.length)} />
        </View>

        {/* Accounts Section */}
        <SectionHeader title="Cuentas Conectadas" />
        {accounts.map((account) => {
          const state = syncState[account.id];
          return (
            <Card key={account.id} style={styles.accountCard}>
              <View style={styles.accountRow}>
                <Avatar name={account.displayName} url={account.avatarUrl} size={44} />
                <View style={styles.accountInfo}>
                  <View style={styles.accountNameRow}>
                    <Text style={styles.accountName} numberOfLines={1}>
                      {account.displayName ?? account.email}
                    </Text>
                    <ProviderBadge provider={account.provider} />
                  </View>
                  <Text style={styles.accountEmail} numberOfLines={1}>{account.email}</Text>
                  <View style={styles.syncStatusRow}>
                    <View
                      style={[
                        styles.syncDot,
                        { backgroundColor: state?.isSyncing ? Colors.warning : Colors.success },
                      ]}
                    />
                    <Text style={styles.syncStatusText}>
                      {state?.isSyncing
                        ? state.progress
                        : account.lastSyncAt
                        ? `Sincronizado ${formatDistanceToNow(account.lastSyncAt, { locale: es, addSuffix: true })}`
                        : 'Nunca sincronizado'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => handleSyncAccount(account.id)}
                  disabled={state?.isSyncing}
                  style={styles.syncBtn}
                >
                  <MaterialCommunityIcons
                    name="refresh"
                    size={20}
                    color={state?.isSyncing ? Colors.textMuted : Colors.primary}
                  />
                </TouchableOpacity>
              </View>
            </Card>
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
            <Text style={styles.seeAll}>Ver todo</Text>
          </TouchableOpacity>
        </View>

        {recentDocuments.length === 0 ? (
          <EmptyState
            icon="inbox-outline"
            title="Sin documentos aún"
            subtitle="Toca Sincronizar ahora para comenzar"
          />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentScroll}>
            {recentDocuments.map((doc) => (
              <RecentDocCard
                key={doc.id}
                doc={doc}
                onPress={() => navigation.navigate('Repository', {
                  screen: 'DocumentDetail',
                  params: { documentId: doc.id },
                })}
              />
            ))}
          </ScrollView>
        )}

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={styles.sectionTitle}>{title}</Text>
  );
}

function StatItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <MaterialCommunityIcons name={icon as any} size={18} color={Colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RecentDocCard({ doc, onPress }: { doc: Document; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.recentCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.recentCardIcon}>
        <MaterialCommunityIcons
          name="file-document-outline"
          size={24}
          color={Colors.primary}
        />
      </View>
      <CategoryBadge category={doc.category} size="sm" />
      <Text style={styles.recentCardName} numberOfLines={2}>{doc.originalFilename}</Text>
      <Text style={styles.recentCardDate}>
        {format(doc.emailDate, 'dd MMM', { locale: es })}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, paddingHorizontal: Spacing.base },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.base,
    marginBottom: Spacing.base,
  },
  headerTitle: { ...Typography.headingL, color: Colors.textPrimary },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    borderColor: Colors.border,
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
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginRight: Spacing.sm,
    gap: Spacing.sm,
    ...Shadows.subtle,
  },
  recentCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentCardName: { ...Typography.caption, color: Colors.textPrimary, fontWeight: '500' },
  recentCardDate: { ...Typography.caption, color: Colors.textMuted },
});
