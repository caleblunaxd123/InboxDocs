import { getDatabase } from './schema';
import { Account, Provider } from '../types';
import {
  saveAccountTokens,
  getAccountTokens,
  deleteAccountTokens,
} from '../utils/tokenStorage';

function rowToAccount(row: any): Account {
  return {
    id: row.id,
    provider: row.provider as Provider,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    // Tokens are populated from SecureStore after DB load (see loadTokensIntoAccount)
    accessTokenEncrypted: row.access_token_encrypted ?? '',
    refreshTokenEncrypted: row.refresh_token_encrypted ?? '',
    tokenExpiresAt: row.token_expires_at,
    lastSyncAt: row.last_sync_at,
    syncFromDate: row.sync_from_date,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

/**
 * Merges SecureStore tokens into account.
 * If SecureStore is empty (first run after migration), falls back to SQLite
 * values and migrates them to SecureStore automatically.
 */
async function loadTokensIntoAccount(account: Account): Promise<Account> {
  const { accessToken, refreshToken } = await getAccountTokens(account.id);

  if (accessToken) {
    // SecureStore already has the tokens — use them
    return { ...account, accessTokenEncrypted: accessToken, refreshTokenEncrypted: refreshToken };
  }

  // Migration path: tokens still in SQLite — migrate to SecureStore and clear SQLite
  if (account.accessTokenEncrypted) {
    await saveAccountTokens(
      account.id,
      account.accessTokenEncrypted,
      account.refreshTokenEncrypted,
    );
    // Clear plain-text tokens from SQLite after migration
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE accounts SET access_token_encrypted = '', refresh_token_encrypted = '' WHERE id = ?`,
      [account.id]
    );
  }

  return account;
}

export async function getAllAccounts(): Promise<Account[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync('SELECT * FROM accounts WHERE is_active = 1 ORDER BY created_at ASC');
  const accounts = rows.map(rowToAccount);
  return Promise.all(accounts.map(loadTokensIntoAccount));
}

export async function getAccountById(id: string): Promise<Account | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync('SELECT * FROM accounts WHERE id = ?', [id]);
  if (!row) return null;
  return loadTokensIntoAccount(rowToAccount(row));
}

export async function upsertAccount(
  account: Omit<Account, 'createdAt'> & { createdAt?: number }
): Promise<void> {
  const db = await getDatabase();

  // Save tokens to SecureStore — never store plain text in SQLite
  await saveAccountTokens(
    account.id,
    account.accessTokenEncrypted,
    account.refreshTokenEncrypted,
  );

  await db.runAsync(
    `INSERT INTO accounts (id, provider, email, display_name, avatar_url, access_token_encrypted, refresh_token_encrypted, token_expires_at, last_sync_at, sync_from_date, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name = excluded.display_name,
       avatar_url = excluded.avatar_url,
       access_token_encrypted = '',
       refresh_token_encrypted = '',
       token_expires_at = excluded.token_expires_at,
       last_sync_at = excluded.last_sync_at,
       sync_from_date = excluded.sync_from_date,
       is_active = excluded.is_active`,
    [
      account.id,
      account.provider,
      account.email,
      account.displayName,
      account.avatarUrl,
      account.tokenExpiresAt,
      account.lastSyncAt,
      account.syncFromDate,
      account.isActive ? 1 : 0,
      account.createdAt ?? Date.now(),
    ]
  );
}

export async function updateAccountTokens(
  id: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): Promise<void> {
  // Tokens go to SecureStore only
  await saveAccountTokens(id, accessToken, refreshToken);
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE accounts SET token_expires_at = ? WHERE id = ?',
    [expiresAt, id]
  );
}

export async function updateAccountLastSync(id: string, timestamp: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE accounts SET last_sync_at = ? WHERE id = ?', [timestamp, id]);
}

export async function deleteAccount(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE accounts SET is_active = 0 WHERE id = ?', [id]);
  await deleteAccountTokens(id);
}
