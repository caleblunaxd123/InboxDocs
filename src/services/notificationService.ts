import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleNewDocumentsNotification(count: number): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `InboxDocs — ${count} documento${count !== 1 ? 's' : ''} nuevo${count !== 1 ? 's' : ''}`,
      body: `Se ${count !== 1 ? 'han encontrado' : 'ha encontrado'} ${count} documento${count !== 1 ? 's' : ''} en tu correo.`,
      data: { screen: 'Repository' },
    },
    trigger: null, // immediate
  });
}
