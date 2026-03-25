import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

// ─── Google / Gmail ──────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID_IOS     = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS     ?? '';
const GOOGLE_CLIENT_ID_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID ?? '';
const GOOGLE_CLIENT_ID_WEB     = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB     ?? '';

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

/** Fetch wrapper with a configurable timeout (default 15s). */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const GOOGLE_AUTH_ENDPOINT  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export async function signInWithGoogle(): Promise<OAuthResult> {
  // Use platform-specific native client ID for PKCE flow (gives refresh tokens)
  // Fall back to Web client ID if platform-specific ID is not configured
  // (Web ID works in Expo Go; native IDs needed only for standalone builds)
  const clientId =
    (Platform.OS === 'ios'     && GOOGLE_CLIENT_ID_IOS)     ? GOOGLE_CLIENT_ID_IOS :
    (Platform.OS === 'android' && GOOGLE_CLIENT_ID_ANDROID) ? GOOGLE_CLIENT_ID_ANDROID :
                                                               GOOGLE_CLIENT_ID_WEB;

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'inboxdocs' });

  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: GOOGLE_SCOPES,
    redirectUri,
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
    extraParams: { access_type: 'offline', prompt: 'consent select_account' },
  });

  await request.makeAuthUrlAsync({ authorizationEndpoint: GOOGLE_AUTH_ENDPOINT });
  const result = await request.promptAsync({ authorizationEndpoint: GOOGLE_AUTH_ENDPOINT });

  if (result.type !== 'success') {
    throw new Error('Google sign-in cancelado o fallido');
  }

  // Exchange authorization code for tokens (PKCE — no client_secret needed)
  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    { tokenEndpoint: GOOGLE_TOKEN_ENDPOINT },
  );

  const profileRes = await fetchWithTimeout(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    { headers: { Authorization: `Bearer ${tokenResponse.accessToken}` } },
  );
  if (!profileRes.ok) throw new Error('No se pudo obtener el perfil de Google');
  const profile = await profileRes.json();

  return {
    accessToken:  tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken ?? '',
    expiresAt:    Date.now() + (tokenResponse.expiresIn ?? 3600) * 1000,
    email:        profile.email,
    displayName:  profile.name ?? profile.email,
    avatarUrl:    profile.picture ?? null,
  };
}

export async function refreshGoogleToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  // Fall back to Web client ID if platform-specific ID is not configured
  // (Web ID works in Expo Go; native IDs needed only for standalone builds)
  const clientId =
    (Platform.OS === 'ios'     && GOOGLE_CLIENT_ID_IOS)     ? GOOGLE_CLIENT_ID_IOS :
    (Platform.OS === 'android' && GOOGLE_CLIENT_ID_ANDROID) ? GOOGLE_CLIENT_ID_ANDROID :
                                                               GOOGLE_CLIENT_ID_WEB;

  const response = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
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
const MICROSOFT_TENANT    = 'common';
const MICROSOFT_SCOPES    = ['Mail.Read', 'User.Read', 'offline_access'];

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
    throw new Error('Microsoft sign-in cancelado o fallido');
  }

  const tokenEndpoint = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/token`;
  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId: MICROSOFT_CLIENT_ID,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    { tokenEndpoint },
  );

  const profileRes = await fetchWithTimeout(
    'https://graph.microsoft.com/v1.0/me',
    { headers: { Authorization: `Bearer ${tokenResponse.accessToken}` } },
  );
  if (!profileRes.ok) throw new Error('No se pudo obtener el perfil de Microsoft');
  const profile = await profileRes.json();

  // Fetch avatar as base64 — URL.createObjectURL does not exist in React Native
  let avatarUrl: string | null = null;
  try {
    const photoRes = await fetchWithTimeout(
      'https://graph.microsoft.com/v1.0/me/photo/$value',
      { headers: { Authorization: `Bearer ${tokenResponse.accessToken}` } },
      8_000,
    );
    if (photoRes.ok) {
      const buffer = await photoRes.arrayBuffer();
      const bytes  = new Uint8Array(buffer);
      let binary   = '';
      bytes.forEach((b) => { binary += String.fromCharCode(b); });
      const contentType = photoRes.headers.get('content-type') ?? 'image/jpeg';
      avatarUrl = `data:${contentType};base64,${btoa(binary)}`;
    }
  } catch {
    // Profile photo is non-critical — continue without it
  }

  return {
    accessToken:  tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken ?? '',
    expiresAt:    Date.now() + (tokenResponse.expiresIn ?? 3600) * 1000,
    email:        profile.mail ?? profile.userPrincipalName,
    displayName:  profile.displayName ?? profile.mail,
    avatarUrl,
  };
}

export async function refreshMicrosoftToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  const tokenEndpoint = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/token`;

  const response = await fetchWithTimeout(tokenEndpoint, {
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
    expiresAt:   Date.now() + data.expires_in * 1000,
  };
}
