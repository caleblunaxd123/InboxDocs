import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('inboxdocs.db');
  }
  return db;
}

export async function initializeDatabase(): Promise<void> {
  const database = await getDatabase();

  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT,
      avatar_url TEXT,
      access_token_encrypted TEXT,
      refresh_token_encrypted TEXT,
      token_expires_at INTEGER,
      last_sync_at INTEGER,
      sync_from_date TEXT,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL,
      attachment_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      file_extension TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      category_confidence REAL,
      sender_email TEXT,
      sender_name TEXT,
      subject TEXT,
      email_date INTEGER NOT NULL,
      downloaded_at INTEGER NOT NULL,
      is_starred INTEGER DEFAULT 0,
      notes TEXT,
      UNIQUE(account_id, message_id, attachment_id)
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      status TEXT DEFAULT 'running',
      emails_scanned INTEGER DEFAULT 0,
      documents_found INTEGER DEFAULT 0,
      documents_downloaded INTEGER DEFAULT 0,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_account ON documents(account_id);
    CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
    CREATE INDEX IF NOT EXISTS idx_documents_email_date ON documents(email_date DESC);
    CREATE INDEX IF NOT EXISTS idx_documents_starred ON documents(is_starred);
  `);

  // Default settings
  const defaults: Record<string, string> = {
    sync_time: '07:00',
    sync_frequency: 'daily',
    sync_on_open: 'true',
    notify_on_new_docs: 'true',
    allowed_extensions: JSON.stringify(['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx', 'xml']),
    openai_api_key: '',
    default_sync_from_days: '30',
    theme: 'system',
    max_file_size_mb: '25',
    ai_categorization_enabled: 'true',
  };

  for (const [key, value] of Object.entries(defaults)) {
    await database.runAsync(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      [key, value]
    );
  }
}
