// expo-notifications is not supported in Expo Go (SDK 53+).
// All functions are wrapped so the app works normally without crashing.

let Notifications: any = null;

try {
  Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
} catch {
  // Not available in Expo Go — silently skip
}

export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    if (!Notifications) return false;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Cooldown entre notificaciones: mínimo 30 minutos entre cada una.
 * Evita spam cuando hay múltiples syncs consecutivos.
 */
let lastNotificationAt = 0;
const NOTIFICATION_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutos

export async function scheduleNewDocumentsNotification(count: number): Promise<void> {
  try {
    if (!Notifications) return;
    if (count <= 0) return;

    // Respetar cooldown
    const now = Date.now();
    if (now - lastNotificationAt < NOTIFICATION_COOLDOWN_MS) return;

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${count} documento${count !== 1 ? 's' : ''} nuevo${count !== 1 ? 's' : ''}`,
        body: `Se ${count !== 1 ? 'encontraron' : 'encontró'} ${count} documento${count !== 1 ? 's' : ''} en tu correo.`,
        data: { screen: 'Repository' },
      },
      trigger: null,
    });

    lastNotificationAt = now;
  } catch {
    // Silently ignore — notifications not critical
  }
}
