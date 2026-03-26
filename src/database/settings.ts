import { getDatabase } from './schema';
import { AppSettings } from '../types';
import { saveOpenAIKey, getOpenAIKey } from '../utils/tokenStorage';

export async function getSetting(key: string): Promise<string | null> {
  if (key === 'openai_api_key') {
    return getOpenAIKey();
  }
  const db = await getDatabase();
  const row: any = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  if (key === 'openai_api_key') {
    await saveOpenAIKey(value);
    // Keep an empty placeholder in SQLite so getAllSettings doesn't fall back
    const db = await getDatabase();
    await db.runAsync(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, '']
    );
    return;
  }
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

export async function getAllSettings(): Promise<AppSettings> {
  const db = await getDatabase();
  const rows: any[] = await db.getAllAsync('SELECT key, value FROM settings');
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  // OpenAI key lives in SecureStore — migration from SQLite happens automatically
  let openaiKey = await getOpenAIKey();
  if (!openaiKey && map.openai_api_key) {
    // Migrate existing key from SQLite to SecureStore
    openaiKey = map.openai_api_key;
    await saveOpenAIKey(openaiKey);
    // Clear from SQLite
    await db.runAsync(
      'UPDATE settings SET value = ? WHERE key = ?',
      ['', 'openai_api_key']
    );
  }

  return {
    sync_time: map.sync_time ?? '07:00',
    sync_frequency: (map.sync_frequency as any) ?? 'daily',
    sync_on_open: map.sync_on_open === 'true',
    notify_on_new_docs: map.notify_on_new_docs === 'true',
    allowed_extensions: map.allowed_extensions ? JSON.parse(map.allowed_extensions) : [
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
      'jpg', 'jpeg', 'png', 'heic', 'webp', 'gif',
      'txt', 'csv', 'xml', 'json',
      'zip', 'rar',
    ],
    openai_api_key: openaiKey,
    default_sync_from_days: parseInt(map.default_sync_from_days ?? '30'),
    theme: (map.theme as any) ?? 'system',
    max_file_size_mb: parseInt(map.max_file_size_mb ?? '25'),
    ai_categorization_enabled: map.ai_categorization_enabled !== 'false',
    biometricsEnabled: map.biometrics_enabled === 'true',
  };
}
