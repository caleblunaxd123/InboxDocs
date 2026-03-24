import 'react-native-get-random-values';
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

function AppBootstrap() {
  const {
    setAccounts,
    setInitialized,
    setRecentDocuments,
    setStats,
    setSettings,
    setHasSeenWalkthrough,
    settings,
    accounts,
  } = useAppStore();

  useEffect(() => {
    bootstrap();
  }, []);

  async function bootstrap() {
    try {
      // Init DB
      await initializeDatabase();

      // Load accounts
      const accs = await getAllAccounts();
      setAccounts(accs);

      // Load walkthrough flag
      const walkthroughSeen = await getSetting('has_seen_walkthrough');
      setHasSeenWalkthrough(walkthroughSeen === 'true');

      // Load settings
      const s = await getAllSettings();
      setSettings(s);

      // Load initial data
      const recent = await getRecentDocuments(10);
      setRecentDocuments(recent);

      const stats = await getDocumentStats();
      setStats(stats.total, stats.totalSize);

      // Request notification perms
      await requestNotificationPermissions();

      setInitialized(true);
    } catch (err) {
      console.error('Bootstrap error:', err);
      setInitialized(true); // still show app even if error
    }
  }

  return null;
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="auto" />
      <AppBootstrap />
      <AppNavigator />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
