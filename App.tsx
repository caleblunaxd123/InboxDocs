import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import AppNavigator from './src/navigation';
import { initializeDatabase } from './src/database/schema';
import { getAllAccounts } from './src/database/accounts';
import { getAllSettings, getSetting } from './src/database/settings';
import { getRecentDocuments, getDocumentStats } from './src/database/documents';
import { useAppStore } from './src/store/useAppStore';
import { requestNotificationPermissions } from './src/services/notificationService';
import { syncGmailAccount, syncOutlookAccount } from './src/services/syncService';
import { ErrorBoundary } from './src/components/ErrorBoundary';

function AppBootstrap() {
  const {
    setAccounts,
    setInitialized,
    setRecentDocuments,
    setStats,
    setSettings,
    setHasSeenWalkthrough,
    setSyncState,
    settings,
    accounts,
  } = useAppStore();

  useEffect(() => {
    bootstrap();
  }, []);

  async function bootstrap() {
    try {
      await initializeDatabase();

      const accs = await getAllAccounts();
      setAccounts(accs);

      const walkthroughSeen = await getSetting('has_seen_walkthrough');
      setHasSeenWalkthrough(walkthroughSeen === 'true');

      const s = await getAllSettings();
      setSettings(s);

      const recent = await getRecentDocuments(10);
      setRecentDocuments(recent);

      const stats = await getDocumentStats();
      setStats(stats.total, stats.totalSize);

      await requestNotificationPermissions();

      setInitialized(true);

      // Auto-sync on open — runs in background without blocking navigation
      if (s.sync_on_open && accs.length > 0) {
        accs.forEach((acc) => {
          const syncFn = acc.provider === 'gmail' ? syncGmailAccount : syncOutlookAccount;
          setSyncState(acc.id, {
            isSyncing: true,
            progress: 'Sync automático...',
            emailsScanned: 0,
            documentsFound: 0,
          });
          syncFn(acc, (p) => {
            setSyncState(acc.id, {
              progress: p.currentAction,
              emailsScanned: p.emailsScanned,
              documentsFound: p.documentsFound,
            });
          })
            .then(async () => {
              setSyncState(acc.id, { isSyncing: false, lastSyncAt: Date.now() });
              const [freshRecent, freshStats] = await Promise.all([
                getRecentDocuments(10),
                getDocumentStats(),
              ]);
              setRecentDocuments(freshRecent);
              setStats(freshStats.total, freshStats.totalSize);
            })
            .catch((err) => {
              console.warn('[AutoSync] Error syncing', acc.email, err?.message);
              setSyncState(acc.id, { isSyncing: false });
            });
        });
      }
    } catch (err) {
      console.error('[Bootstrap] Error:', err);
      setInitialized(true); // always show the app even if bootstrap partially fails
    }
  }

  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <StatusBar style="auto" />
        <AppBootstrap />
        <AppNavigator />
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
