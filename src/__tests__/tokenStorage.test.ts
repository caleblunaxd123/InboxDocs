/**
 * Unit tests for tokenStorage utility.
 *
 * Uses the in-memory expo-secure-store mock defined in __mocks__/expo-secure-store.ts.
 * Verifies the contract: tokens saved under namespaced keys and retrieved correctly.
 */
import {
  saveAccountTokens,
  getAccountTokens,
  deleteAccountTokens,
  saveOpenAIKey,
  getOpenAIKey,
  deleteOpenAIKey,
} from '../utils/tokenStorage';

// Reset in-memory mock store between tests
// The mock is a plain object — we reach into it via the module
const secureStoreMock = require('../__tests__/__mocks__/expo-secure-store') as {
  setItemAsync: jest.Mock;
  getItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};

// ─── Account tokens ──────────────────────────────────────────────────────────

describe('tokenStorage — account tokens', () => {
  beforeEach(async () => {
    // Clear stored data by deleting the internal store object keys
    const store = (secureStoreMock as any).store ?? {};
    Object.keys(store).forEach((k) => delete store[k]);
    // Also clear via the mock's internal store (white-box since we own the mock)
    const mod = require('../__tests__/__mocks__/expo-secure-store');
    if (mod._store) { Object.keys(mod._store).forEach((k) => delete mod._store[k]); }
  });

  it('saves and retrieves access + refresh tokens', async () => {
    await saveAccountTokens('acc-1', 'access_abc', 'refresh_xyz');
    const tokens = await getAccountTokens('acc-1');
    expect(tokens.accessToken).toBe('access_abc');
    expect(tokens.refreshToken).toBe('refresh_xyz');
  });

  it('uses namespaced keys so different accounts do not collide', async () => {
    await saveAccountTokens('acc-1', 'token_A', 'refresh_A');
    await saveAccountTokens('acc-2', 'token_B', 'refresh_B');

    const t1 = await getAccountTokens('acc-1');
    const t2 = await getAccountTokens('acc-2');

    expect(t1.accessToken).toBe('token_A');
    expect(t2.accessToken).toBe('token_B');
    expect(t1.accessToken).not.toBe(t2.accessToken);
  });

  it('returns empty strings when account has no tokens', async () => {
    const tokens = await getAccountTokens('acc-unknown');
    expect(tokens.accessToken).toBe('');
    expect(tokens.refreshToken).toBe('');
  });

  it('overwrites tokens when saved again for same account', async () => {
    await saveAccountTokens('acc-1', 'old_token', 'old_refresh');
    await saveAccountTokens('acc-1', 'new_token', 'new_refresh');

    const tokens = await getAccountTokens('acc-1');
    expect(tokens.accessToken).toBe('new_token');
    expect(tokens.refreshToken).toBe('new_refresh');
  });

  it('deletes both tokens for an account', async () => {
    await saveAccountTokens('acc-1', 'access_abc', 'refresh_xyz');
    await deleteAccountTokens('acc-1');

    const tokens = await getAccountTokens('acc-1');
    expect(tokens.accessToken).toBe('');
    expect(tokens.refreshToken).toBe('');
  });

  it('deleteAccountTokens does not throw when account has no tokens', async () => {
    await expect(deleteAccountTokens('nonexistent-acc')).resolves.not.toThrow();
  });

  it('does not save refresh token when empty string provided', async () => {
    // saveAccountTokens skips saving empty refresh token
    await saveAccountTokens('acc-1', 'token_X', '');
    const tokens = await getAccountTokens('acc-1');
    expect(tokens.accessToken).toBe('token_X');
    // refresh should be empty (not written)
    expect(tokens.refreshToken).toBe('');
  });

  it('saving tokens for multiple accounts does not affect others on delete', async () => {
    await saveAccountTokens('acc-1', 'token_1', 'refresh_1');
    await saveAccountTokens('acc-2', 'token_2', 'refresh_2');
    await deleteAccountTokens('acc-1');

    const t1 = await getAccountTokens('acc-1');
    const t2 = await getAccountTokens('acc-2');

    expect(t1.accessToken).toBe('');
    expect(t2.accessToken).toBe('token_2');
  });
});

// ─── OpenAI key ──────────────────────────────────────────────────────────────

describe('tokenStorage — OpenAI API key', () => {
  it('saves and retrieves the OpenAI key', async () => {
    await saveOpenAIKey('sk-test-12345');
    const key = await getOpenAIKey();
    expect(key).toBe('sk-test-12345');
  });

  it('returns empty string when no key saved', async () => {
    await deleteOpenAIKey();
    const key = await getOpenAIKey();
    expect(key).toBe('');
  });

  it('overwrites previous OpenAI key', async () => {
    await saveOpenAIKey('sk-old');
    await saveOpenAIKey('sk-new');
    const key = await getOpenAIKey();
    expect(key).toBe('sk-new');
  });

  it('deletes key without throwing', async () => {
    await saveOpenAIKey('sk-temp');
    await expect(deleteOpenAIKey()).resolves.not.toThrow();
    const key = await getOpenAIKey();
    expect(key).toBe('');
  });

  it('OpenAI key is stored under a fixed key (not account-namespaced)', async () => {
    // Saving account tokens should not affect the OpenAI key
    await saveOpenAIKey('sk-important');
    await saveAccountTokens('acc-1', 'token', 'refresh');
    const key = await getOpenAIKey();
    expect(key).toBe('sk-important');
  });
});
