import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

WebBrowser.maybeCompleteAuthSession();

// ─── Google / Gmail ──────────────────────────────────────────────────────────
//
// SEGURIDAD: No usamos serverAuthCode exchange con client_secret en el cliente.
// El SDK nativo de Google Sign-In gestiona internamente el refresh de tokens.
// Usamos GoogleSignin.getTokens() para el access token y
// GoogleSignin.signInSilently() para refrescarlo, sin exponer ningún secreto.

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

// Configurar el SDK nativo con los Client IDs de plataforma
GoogleSignin.configure({
  scopes: GOOGLE_SCOPES,
  webClientId: GOOGLE_CLIENT_ID_WEB,
  iosClientId: GOOGLE_CLIENT_ID_IOS || GOOGLE_CLIENT_ID_WEB,
  offlineAccess: false, // No necesitamos serverAuthCode — usamos tokens nativos
});

export async function signInWithGoogle(): Promise<OAuthResult> {
  await GoogleSignin.hasPlayServices();

  // Forzar logout previo para mostrar el selector de cuentas
  try { await GoogleSignin.signOut(); } catch { /* sin sesión previa, ignorar */ }

  const userInfo = await GoogleSignin.signIn();

  if (userInfo.type === 'cancelled') {
    throw new Error('Cancelaste el inicio de sesión. Puedes conectarte cuando desees.');
  }
  if (userInfo.type !== 'success') {
    throw new Error('No se pudo iniciar sesión correctamente.');
  }

  // Obtener tokens directamente del SDK nativo (sin client_secret)
  const tokens = await GoogleSignin.getTokens();
  const accessToken = tokens.accessToken;

  if (!accessToken) {
    throw new Error('No se recibió el token de acceso de Google.');
  }

  // Obtener perfil del usuario
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) {
    throw new Error('No se pudo obtener el perfil de Google.');
  }
  const profile = await profileRes.json();

  return {
    accessToken,
    refreshToken: '', // El SDK nativo gestiona el refresh internamente
    expiresAt: Date.now() + 3600 * 1000, // Los tokens de Google duran ~1 hora
    email: profile.email ?? userInfo.data?.user?.email ?? '',
    displayName: profile.name ?? userInfo.data?.user?.name ?? profile.email,
    avatarUrl: profile.picture ?? userInfo.data?.user?.photo ?? null,
  };
}

/**
 * Refresca el token de Google usando el SDK nativo (signInSilently).
 * No requiere client_secret — el SDK gestiona el refresh de forma segura.
 */
export async function refreshGoogleToken(): Promise<{ accessToken: string; expiresAt: number }> {
  try {
    // signInSilently refresca el token si ha expirado
    await GoogleSignin.signInSilently();
    const tokens = await GoogleSignin.getTokens();
    return {
      accessToken: tokens.accessToken,
      expiresAt: Date.now() + 3600 * 1000,
    };
  } catch (err: any) {
    // Si el silent sign-in falla, el usuario debe reconectarse manualmente
    const authErr: any = new Error('Sesión expirada. Reconecta tu cuenta para continuar.');
    authErr.code = 'SESSION_EXPIRED';
    throw authErr;
  }
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

  // Try to get photo as base64 data URI (URL.createObjectURL is unavailable in React Native)
  let avatarUrl: string | null = null;
  try {
    const photoRes = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
      headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
    });
    if (photoRes.ok) {
      const arrayBuffer = await photoRes.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8Array.byteLength; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64 = btoa(binary);
      avatarUrl = `data:image/jpeg;base64,${base64}`;
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
