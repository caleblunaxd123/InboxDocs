/**
 * tokenStorage — all sensitive credentials live in expo-secure-store,
 * never in plain SQLite.
 */
import * as SecureStore from 'expo-secure-store';

const keyAccess  = (id: string) => `inboxdocs_access_${id}`;
const keyRefresh = (id: string) => `inboxdocs_refresh_${id}`;
const KEY_OPENAI = 'inboxdocs_openai_key';

// ─── Account tokens ────────────────────────────────────────────────────────

export async function saveAccountTokens(
  accountId: string,
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  await SecureStore.setItemAsync(keyAccess(accountId), accessToken);
  if (refreshToken) {
    await SecureStore.setItemAsync(keyRefresh(accountId), refreshToken);
  }
}

export async function getAccountTokens(
  accountId: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(keyAccess(accountId)),
    SecureStore.getItemAsync(keyRefresh(accountId)),
  ]);
  return { accessToken: accessToken ?? '', refreshToken: refreshToken ?? '' };
}

export async function deleteAccountTokens(accountId: string): Promise<void> {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(keyAccess(accountId)),
    SecureStore.deleteItemAsync(keyRefresh(accountId)),
  ]);
}

// ─── OpenAI API key ────────────────────────────────────────────────────────

export async function saveOpenAIKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_OPENAI, key);
}

export async function getOpenAIKey(): Promise<string> {
  return (await SecureStore.getItemAsync(KEY_OPENAI)) ?? '';
}

export async function deleteOpenAIKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_OPENAI).catch(() => {});
}
