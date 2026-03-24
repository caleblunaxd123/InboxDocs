import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppStore } from '../store/useAppStore';
import { Colors, Typography } from '../utils/theme';

// Screens
import OnboardingScreen from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import RepositoryScreen from '../screens/RepositoryScreen';
import DocumentDetailScreen from '../screens/DocumentDetailScreen';
import DocumentViewerScreen from '../screens/DocumentViewerScreen';
import SettingsScreen from '../screens/SettingsScreen';

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
  Onboarding: undefined;
};

export type MainTabParams = {
  Home: undefined;
  Repository: undefined;
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
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, string> = {
            Home: 'home-outline',
            Repository: 'folder-outline',
            Settings: 'cog-outline',
          };
          return (
            <MaterialCommunityIcons name={icons[route.name] as any} size={size} color={color} />
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Inicio' }} />
      <Tab.Screen name="Repository" component={RepositoryScreen} options={{ tabBarLabel: 'Documentos' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: 'Ajustes' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { accounts, isInitialized } = useAppStore();
  const isAuthenticated = accounts.length > 0;

  if (!isInitialized) return null;

  return (
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
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Onboarding" component={OnboardingScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
