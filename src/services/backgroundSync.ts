/**
 * Background sync using expo-background-fetch + expo-task-manager.
 *
 * The TaskManager.defineTask call MUST run at module load time (not inside
 * an async function), so this file is imported at the top of index.ts.
 */
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { getAllAccounts } from '../database/accounts';
import { syncGmailAccount, syncOutlookAccount } from './syncService';

export const BACKGROUND_SYNC_TASK = 'INBOXDOCS_BACKGROUND_SYNC';

// ─── Task definition (must be at module level) ───────────────────────────────

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    const accounts = await getAllAccounts();
    if (accounts.length === 0) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    let totalNew = 0;
    const results = await Promise.allSettled(
      accounts.map(async (acc) => {
        const syncFn = acc.provider === 'gmail' ? syncGmailAccount : syncOutlookAccount;
        const found = await syncFn(acc, () => {});
        return found;
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') totalNew += r.value ?? 0;
    }

    if (totalNew > 0) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'InboxDocs',
          body:
            totalNew === 1
              ? '1 nuevo documento encontrado'
              : `${totalNew} nuevos documentos encontrados`,
          data: { screen: 'Repository' },
        },
        trigger: null,
      });
    }

    return totalNew > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (err) {
    console.warn('[BackgroundSync] Task error:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ─── Public API ───────────────────────────────────────────────────────────────

/** Frequency label → interval in minutes. */
export const SYNC_FREQUENCY_MINUTES: Record<string, number> = {
  every_6h: 360,
  every_12h: 720,
  daily: 1440,
  manual: 0,
};

export async function registerBackgroundSync(frequencyMinutes: number): Promise<void> {
  if (frequencyMinutes <= 0) return; // 'manual' — do not register
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      console.warn('[BackgroundSync] Background fetch is restricted or denied by the OS.');
      return;
    }
    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: frequencyMinutes * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch (err) {
    console.warn('[BackgroundSync] Registration failed:', err);
  }
}

export async function unregisterBackgroundSync(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    }
  } catch (err) {
    console.warn('[BackgroundSync] Unregistration failed:', err);
  }
}

/**
 * Updates the background sync schedule.
 * Pass frequency string from AppSettings.sync_frequency.
 */
export async function applyBackgroundSyncFrequency(
  frequency: string,
): Promise<void> {
  await unregisterBackgroundSync();
  const minutes = SYNC_FREQUENCY_MINUTES[frequency] ?? 0;
  await registerBackgroundSync(minutes);
}
