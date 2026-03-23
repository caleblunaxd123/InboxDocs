import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

// ─── Google / Gmail ──────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID_IOS = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS ?? '';
const GOOGLE_CLIENT_ID_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID ?? '';
const GOOGLE_CLIENT_ID_WEB = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB ?? '';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export interface OAuthResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export async function signInWithGoogle(): Promise<OAuthResult> {
  const clientId =
    Platform.OS === 'ios'
      ? GOOGLE_CLIENT_ID_IOS
      : Platform.OS === 'android'
      ? GOOGLE_CLIENT_ID_ANDROID
      : GOOGLE_CLIENT_ID_WEB;

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'inboxdocs' });

  const discovery = AuthSession.useAutoDiscovery('https://accounts.google.com');

  // Build request manually since we need PKCE
  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: GOOGLE_SCOPES,
    redirectUri,
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
  });

  await request.makeAuthUrlAsync({ authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth' });

  const result = await request.promptAsync({
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  });

  if (result.type !== 'success') {
    throw new Error('Google sign-in cancelled or failed');
  }

  // Exchange code for tokens
  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri,
      extraParams: {
        code_verifier: request.codeVerifier ?? '',
      },
    },
    { tokenEndpoint: 'https://oauth2.googleapis.com/token' }
  );

  // Fetch user profile
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
  });
  const profile = await profileRes.json();

  return {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken ?? '',
    expiresAt: Date.now() + (tokenResponse.expiresIn ?? 3600) * 1000,
    email: profile.email,
    displayName: profile.name ?? profile.email,
    avatarUrl: profile.picture ?? null,
  };
}

export async function refreshGoogleToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }> {
  const clientId =
    Platform.OS === 'ios'
      ? GOOGLE_CLIENT_ID_IOS
      : Platform.OS === 'android'
      ? GOOGLE_CLIENT_ID_ANDROID
      : GOOGLE_CLIENT_ID_WEB;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description ?? 'Token refresh failed');

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

// ─── Microsoft / Outlook ─────────────────────────────────────────────────────

const MICROSOFT_CLIENT_ID = process.env.EXPO_PUBLIC_MICROSOFT_CLIENT_ID ?? '';
const MICROSOFT_TENANT = 'common';

const MICROSOFT_SCOPES = ['Mail.Read', 'User.Read', 'offline_access'];

export async function signInWithMicrosoft(): Promise<OAuthResult> {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'inboxdocs' });

  const request = new AuthSession.AuthRequest({
    clientId: MICROSOFT_CLIENT_ID,
    scopes: MICROSOFT_SCOPES,
    redirectUri,
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
  });

  const authEndpoint = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/authorize`;

  await request.makeAuthUrlAsync({ authorizationEndpoint: authEndpoint });

  const result = await request.promptAsync({ authorizationEndpoint: authEndpoint });

  if (result.type !== 'success') {
    throw new Error('Microsoft sign-in cancelled or failed');
  }

  const tokenEndpoint = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/token`;

  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId: MICROSOFT_CLIENT_ID,
      code: result.params.code,
      redirectUri,
      extraParams: {
        code_verifier: request.codeVerifier ?? '',
      },
    },
    { tokenEndpoint }
  );

  // Fetch user profile from Graph API
  const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
  });
  const profile = await profileRes.json();

  // Try to get photo
  let avatarUrl: string | null = null;
  try {
    const photoRes = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
      headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
    });
    if (photoRes.ok) {
      const blob = await photoRes.blob();
      avatarUrl = URL.createObjectURL(blob);
    }
  } catch {
    // No photo available
  }

  return {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken ?? '',
    expiresAt: Date.now() + (tokenResponse.expiresIn ?? 3600) * 1000,
    email: profile.mail ?? profile.userPrincipalName,
    displayName: profile.displayName ?? profile.mail,
    avatarUrl,
  };
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }> {
  const tokenEndpoint = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/token`;

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: MICROSOFT_SCOPES.join(' '),
    }).toString(),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description ?? 'Token refresh failed');

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

// ─── Secure Storage ───────────────────────────────────────────────────────────

export async function storeToken(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

export async function getStoredToken(key: string): Promise<string | null> {
  return await SecureStore.getItemAsync(key);
}

export async function deleteStoredToken(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}
