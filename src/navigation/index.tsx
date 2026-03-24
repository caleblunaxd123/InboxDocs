import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppState, AppStateStatus } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { Colors, Typography } from '../utils/theme';
import { BiometricLock } from '../components/ui/BiometricLock';

// Screens
import WalkthroughScreen from '../screens/WalkthroughScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import RepositoryScreen from '../screens/RepositoryScreen';
import DocumentDetailScreen from '../screens/DocumentDetailScreen';
import DocumentViewerScreen from '../screens/DocumentViewerScreen';
import SettingsScreen from '../screens/SettingsScreen';
import InsightsScreen from '../screens/InsightsScreen';

export type RootStackParams = {
  Main: undefined;
  DocumentDetail: { documentId: string };
  DocumentViewer: {
    filePath: string;
    filename: string;
    mimeType: string;
    fileExtension: string;
  };
};

export type AuthStackParams = {
  Walkthrough: undefined;
  Onboarding: undefined;
};

export type MainTabParams = {
  Home: undefined;
  Repository: undefined;
  Insights: undefined;
  Settings: undefined;
};

const RootStack = createStackNavigator<RootStackParams>();
const AuthStack = createStackNavigator<AuthStackParams>();
const Tab = createBottomTabNavigator<MainTabParams>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          borderTopColor: Colors.border,
          backgroundColor: Colors.surface,
          paddingBottom: 4,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          ...Typography.caption,
          fontWeight: '500',
        },
        tabBarIcon: ({ color, size, focused }) => {
          const icons: Record<string, { outline: string; filled: string }> = {
            Home: { outline: 'home-outline', filled: 'home' },
            Repository: { outline: 'folder-outline', filled: 'folder' },
            Insights: { outline: 'chart-box-outline', filled: 'chart-box' },
            Settings: { outline: 'cog-outline', filled: 'cog' },
          };
          const iconSet = icons[route.name];
          return (
            <MaterialCommunityIcons
              name={(focused ? iconSet.filled : iconSet.outline) as any}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Inicio' }} />
      <Tab.Screen name="Repository" component={RepositoryScreen} options={{ tabBarLabel: 'Documentos' }} />
      <Tab.Screen name="Insights" component={InsightsScreen} options={{ tabBarLabel: 'Estadísticas' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: 'Ajustes' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { accounts, isInitialized, settings, hasSeenWalkthrough } = useAppStore();
  const isAuthenticated = accounts.length > 0;
  const [locked, setLocked] = React.useState(false);
  // Timestamp when app went to background — used to ignore auth-dialog AppState flickers
  const backgroundedAt = React.useRef<number | null>(null);

  // Lock on initial app launch (once initialized and biometrics enabled)
  React.useEffect(() => {
    if (!isInitialized) return;
    if (settings?.biometricsEnabled) {
      setLocked(true);
    }
  }, [isInitialized, settings?.biometricsEnabled]);

  // Lock only when app comes back from a real background (>2s), NOT from auth dialog dismiss
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active' && settings?.biometricsEnabled) {
        const bgTime = backgroundedAt.current;
        backgroundedAt.current = null;
        if (bgTime && Date.now() - bgTime > 2000) {
          setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, [settings?.biometricsEnabled]);

  if (!isInitialized) return null;

  return (
    <>
      <NavigationContainer>
        {isAuthenticated ? (
          <RootStack.Navigator screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="Main" component={MainTabs} />
            <RootStack.Screen
              name="DocumentDetail"
              component={DocumentDetailScreen}
              options={{ presentation: 'card', gestureEnabled: true }}
            />
            <RootStack.Screen
              name="DocumentViewer"
              component={DocumentViewerScreen}
              options={{ presentation: 'modal', gestureEnabled: true, headerShown: false }}
            />
          </RootStack.Navigator>
        ) : (
          <AuthStack.Navigator
            screenOptions={{ headerShown: false, animationEnabled: true }}
            initialRouteName={hasSeenWalkthrough ? 'Onboarding' : 'Walkthrough'}
          >
            <AuthStack.Screen
              name="Walkthrough"
              component={WalkthroughScreen}
              options={{ gestureEnabled: false }}
            />
            <AuthStack.Screen name="Onboarding" component={OnboardingScreen} />
          </AuthStack.Navigator>
        )}
      </NavigationContainer>
      <BiometricLock visible={locked} onAuthenticated={() => setLocked(false)} />
    </>
  );
}
