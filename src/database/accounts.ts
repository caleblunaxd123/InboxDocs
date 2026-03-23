import { getDatabase } from './schema';
import { Account, Provider } from '../types';

function rowToAccount(row: any): Account {
  return {
    id: row.id,
    provider: row.provider as Provider,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    accessTokenEncrypted: row.access_token_encrypted,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    tokenExpiresAt: row.token_expires_at,
    lastSyncAt: row.last_sync_at,
    syncFromDate: row.sync_from_date,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

export async function getAllAccounts(): Promise<Account[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync('SELECT * FROM accounts WHERE is_active = 1 ORDER BY created_at ASC');
  return rows.map(rowToAccount);
}

export async function getAccountById(id: string): Promise<Account | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync('SELECT * FROM accounts WHERE id = ?', [id]);
  return row ? rowToAccount(row) : null;
}

export async function upsertAccount(account: Omit<Account, 'createdAt'> & { createdAt?: number }): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO accounts (id, provider, email, display_name, avatar_url, access_token_encrypted, refresh_token_encrypted, token_expires_at, last_sync_at, sync_from_date, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name = excluded.display_name,
       avatar_url = excluded.avatar_url,
       access_token_encrypted = excluded.access_token_encrypted,
       refresh_token_encrypted = excluded.refresh_token_encrypted,
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
      account.accessTokenEncrypted,
      account.refreshTokenEncrypted,
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
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE accounts SET access_token_encrypted = ?, refresh_token_encrypted = ?, token_expires_at = ? WHERE id = ?',
    [accessToken, refreshToken, expiresAt, id]
  );
}

export async function updateAccountLastSync(id: string, timestamp: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE accounts SET last_sync_at = ? WHERE id = ?', [timestamp, id]);
}

export async function deleteAccount(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE accounts SET is_active = 0 WHERE id = ?', [id]);
}
