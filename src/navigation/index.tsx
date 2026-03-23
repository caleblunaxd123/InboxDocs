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
import SettingsScreen from '../screens/SettingsScreen';

export type AuthStackParams = {
  Onboarding: undefined;
};

export type MainTabParams = {
  Home: undefined;
  Repository: undefined;
  Settings: undefined;
};

export type RepositoryStackParams = {
  RepositoryList: undefined;
  DocumentDetail: { documentId: string };
};

const AuthStack = createStackNavigator<AuthStackParams>();
const Tab = createBottomTabNavigator<MainTabParams>();
const RepositoryStack = createStackNavigator<RepositoryStackParams>();

function RepositoryNavigator() {
  return (
    <RepositoryStack.Navigator screenOptions={{ headerShown: false }}>
      <RepositoryStack.Screen name="RepositoryList" component={RepositoryScreen} />
      <RepositoryStack.Screen name="DocumentDetail" component={DocumentDetailScreen} />
    </RepositoryStack.Navigator>
  );
}

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
      <Tab.Screen name="Repository" component={RepositoryNavigator} options={{ tabBarLabel: 'Documentos' }} />
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
        <MainTabs />
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Onboarding" component={OnboardingScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
