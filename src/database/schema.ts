import * as SQLite from 'expo-sqlite';

// Promise-based singleton — safe against concurrent initialization calls.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('inboxdocs.db');
  }
  return dbPromise;
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

    CREATE TABLE IF NOT EXISTS sunat_invoices (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      sunat_document_type TEXT NOT NULL DEFAULT 'unknown',
      serie TEXT NOT NULL DEFAULT '',
      correlativo TEXT NOT NULL DEFAULT '',
      full_number TEXT NOT NULL DEFAULT '',
      issue_date TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      issuer_ruc TEXT NOT NULL DEFAULT '',
      issuer_name TEXT NOT NULL DEFAULT '',
      issuer_address TEXT,
      receiver_ruc TEXT,
      receiver_name TEXT,
      currency TEXT NOT NULL DEFAULT 'PEN',
      subtotal REAL NOT NULL DEFAULT 0,
      igv REAL NOT NULL DEFAULT 0,
      other_charges REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      line_items TEXT NOT NULL DEFAULT '[]',
      extracted_at INTEGER NOT NULL,
      extraction_source TEXT NOT NULL DEFAULT 'xml',
      raw_xml TEXT,
      UNIQUE(document_id)
    );

    CREATE INDEX IF NOT EXISTS idx_documents_account ON documents(account_id);
    CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
    CREATE INDEX IF NOT EXISTS idx_documents_email_date ON documents(email_date DESC);
    CREATE INDEX IF NOT EXISTS idx_documents_starred ON documents(is_starred);
    CREATE INDEX IF NOT EXISTS idx_sunat_issuer ON sunat_invoices(issuer_ruc);
    CREATE INDEX IF NOT EXISTS idx_sunat_issue_date ON sunat_invoices(issue_date);
  `);

  // Migration: ensure UNIQUE index exists on DBs created before the constraint was added.
  try {
    await database.execAsync(`
      DELETE FROM documents WHERE rowid NOT IN (
        SELECT MIN(rowid) FROM documents
        GROUP BY account_id, message_id, attachment_id
      );
    `);
    await database.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_unique
      ON documents(account_id, message_id, attachment_id);
    `);
  } catch {
    // Index already exists via the table UNIQUE constraint — fine.
  }

  // Default settings
  const defaults: Record<string, string> = {
    sync_time: '07:00',
    sync_frequency: 'daily',
    sync_on_open: 'true',
    notify_on_new_docs: 'true',
    allowed_extensions: JSON.stringify([
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
      'jpg', 'jpeg', 'png', 'heic', 'webp', 'gif',
      'txt', 'csv', 'xml', 'json',
      'zip', 'rar',
    ]),
    openai_api_key: '',
    default_sync_from_days: '30',
    theme: 'system',
    max_file_size_mb: '25',
    ai_categorization_enabled: 'true',
    biometrics_enabled: 'false',
  };

  for (const [key, value] of Object.entries(defaults)) {
    await database.runAsync(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      [key, value]
    );
  }
}
