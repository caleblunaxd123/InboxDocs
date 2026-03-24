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

export async function scheduleNewDocumentsNotification(count: number): Promise<void> {
  try {
    if (!Notifications) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `InboxDocs — ${count} documento${count !== 1 ? 's' : ''} nuevo${count !== 1 ? 's' : ''}`,
        body: `Se ${count !== 1 ? 'han encontrado' : 'ha encontrado'} ${count} documento${count !== 1 ? 's' : ''} en tu correo.`,
        data: { screen: 'Repository' },
      },
      trigger: null,
    });
  } catch {
    // Silently ignore — notifications not critical
  }
}
