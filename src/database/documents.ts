import { getDatabase } from './schema';
import { Document, DocumentFilters, CategoryId } from '../types';
import * as FileSystem from 'expo-file-system/legacy';

function rowToDocument(row: any): Document {
  return {
    id: row.id,
    accountId: row.account_id,
    messageId: row.message_id,
    attachmentId: row.attachment_id,
    filename: row.filename,
    originalFilename: row.original_filename,
    filePath: row.file_path,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    fileExtension: row.file_extension,
    category: row.category as CategoryId,
    categoryConfidence: row.category_confidence,
    senderEmail: row.sender_email,
    senderName: row.sender_name,
    subject: row.subject,
    emailDate: row.email_date,
    downloadedAt: row.downloaded_at,
    isStarred: row.is_starred === 1,
    notes: row.notes,
  };
}

export async function insertDocument(doc: Document): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR IGNORE INTO documents (id, account_id, message_id, attachment_id, filename, original_filename, file_path, file_size, mime_type, file_extension, category, category_confidence, sender_email, sender_name, subject, email_date, downloaded_at, is_starred, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      doc.id, doc.accountId, doc.messageId, doc.attachmentId,
      doc.filename, doc.originalFilename, doc.filePath, doc.fileSize,
      doc.mimeType, doc.fileExtension, doc.category, doc.categoryConfidence,
      doc.senderEmail, doc.senderName, doc.subject, doc.emailDate,
      doc.downloadedAt, doc.isStarred ? 1 : 0, doc.notes,
    ]
  );
}

export async function getDocumentById(id: string): Promise<Document | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync('SELECT * FROM documents WHERE id = ?', [id]);
  return row ? rowToDocument(row) : null;
}

export async function documentExists(accountId: string, messageId: string, attachmentId: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    'SELECT id FROM documents WHERE account_id = ? AND message_id = ? AND attachment_id = ?',
    [accountId, messageId, attachmentId]
  );
  return !!row;
}

export async function updateDocumentCategory(id: string, category: CategoryId, confidence: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE documents SET category = ?, category_confidence = ? WHERE id = ?',
    [category, confidence, id]
  );
}

export async function toggleStarDocument(id: string, isStarred: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE documents SET is_starred = ? WHERE id = ?', [isStarred ? 1 : 0, id]);
}

export async function updateDocumentNotes(id: string, notes: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE documents SET notes = ? WHERE id = ?', [notes, id]);
}

export async function deleteAllDocuments(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM documents');
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDatabase();
  const row: any = await db.getFirstAsync('SELECT file_path FROM documents WHERE id = ?', [id]);
  await db.runAsync('DELETE FROM documents WHERE id = ?', [id]);
  if (row?.file_path) {
    try {
      await FileSystem.deleteAsync(row.file_path, { idempotent: true });
    } catch (e) {
      console.warn('[deleteDocument] Could not delete file:', e);
    }
  }
}

export async function getFilteredDocuments(filters: DocumentFilters): Promise<Document[]> {
  const db = await getDatabase();
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.category !== 'all') {
    conditions.push('d.category = ?');
    params.push(filters.category);
  }

  if (filters.provider !== 'all') {
    conditions.push('a.provider = ?');
    params.push(filters.provider);
  }

  if (filters.fileType !== 'all') {
    const extMap: Record<string, string[]> = {
      pdf: ['pdf'],
      images: ['jpg', 'jpeg', 'png', 'heic', 'webp'],
      word: ['docx'],
      excel: ['xlsx'],
      xml: ['xml', 'txt'],
    };
    const exts = extMap[filters.fileType] ?? [];
    if (exts.length > 0) {
      conditions.push(`d.file_extension IN (${exts.map(() => '?').join(',')})`);
      params.push(...exts);
    }
  }

  if (filters.dateRange !== 'all') {
    const now = Date.now();
    const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[filters.dateRange];
    if (days) {
      conditions.push('d.email_date >= ?');
      params.push(now - days * 24 * 60 * 60 * 1000);
    }
  }

  if (filters.starredOnly) {
    conditions.push('d.is_starred = 1');
  }

  if (filters.searchQuery.length >= 2) {
    const q = `%${filters.searchQuery}%`;
    conditions.push('(d.filename LIKE ? OR d.sender_name LIKE ? OR d.sender_email LIKE ? OR d.subject LIKE ?)');
    params.push(q, q, q, q);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sortMap: Record<string, string> = {
    date_desc: 'd.email_date DESC',
    date_asc: 'd.email_date ASC',
    name_asc: 'd.filename ASC',
    size_desc: 'd.file_size DESC',
    sender: 'd.sender_name ASC',
  };
  const orderBy = sortMap[filters.sortBy] ?? 'd.email_date DESC';

  const rows = await db.getAllAsync(
    `SELECT d.* FROM documents d
     LEFT JOIN accounts a ON d.account_id = a.id
     ${where}
     ORDER BY ${orderBy}`,
    params
  );
  return rows.map(rowToDocument);
}

export async function getFilteredDocumentsPage(
  filters: DocumentFilters,
  offset: number,
  limit: number
): Promise<Document[]> {
  const db = await getDatabase();
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.category !== 'all') {
    conditions.push('d.category = ?');
    params.push(filters.category);
  }
  if (filters.provider !== 'all') {
    conditions.push('a.provider = ?');
    params.push(filters.provider);
  }
  if (filters.fileType !== 'all') {
    const extMap: Record<string, string[]> = {
      pdf: ['pdf'],
      images: ['jpg', 'jpeg', 'png', 'heic', 'webp'],
      word: ['docx'],
      excel: ['xlsx'],
      xml: ['xml', 'txt'],
    };
    const exts = extMap[filters.fileType] ?? [];
    if (exts.length > 0) {
      conditions.push(`d.file_extension IN (${exts.map(() => '?').join(',')})`);
      params.push(...exts);
    }
  }
  if (filters.dateRange !== 'all') {
    const now = Date.now();
    const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[filters.dateRange];
    if (days) {
      conditions.push('d.email_date >= ?');
      params.push(now - days * 24 * 60 * 60 * 1000);
    }
  }
  if (filters.starredOnly) {
    conditions.push('d.is_starred = 1');
  }
  if (filters.searchQuery.length >= 2) {
    const q = `%${filters.searchQuery}%`;
    conditions.push('(d.original_filename LIKE ? OR d.sender_name LIKE ? OR d.sender_email LIKE ? OR d.subject LIKE ?)');
    params.push(q, q, q, q);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sortMap: Record<string, string> = {
    date_desc: 'd.email_date DESC',
    date_asc: 'd.email_date ASC',
    name_asc: 'd.original_filename ASC',
    size_desc: 'd.file_size DESC',
    sender: 'd.sender_name ASC',
  };
  const orderBy = sortMap[filters.sortBy] ?? 'd.email_date DESC';

  params.push(limit, offset);
  const rows = await db.getAllAsync(
    `SELECT d.* FROM documents d
     LEFT JOIN accounts a ON d.account_id = a.id
     ${where}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    params
  );
  return rows.map(rowToDocument);
}

/**
 * Returns ALL documents matching the given filters — no pagination limit.
 * Use for CSV export so the full dataset is always exported.
 */
export async function getAllFilteredDocuments(filters: DocumentFilters): Promise<Document[]> {
  return getFilteredDocuments(filters);
}

export async function getRecentDocuments(limit = 10, accountId?: string | null): Promise<Document[]> {
  const db = await getDatabase();
  if (accountId) {
    const rows = await db.getAllAsync(
      'SELECT * FROM documents WHERE account_id = ? ORDER BY downloaded_at DESC LIMIT ?',
      [accountId, limit]
    );
    return rows.map(rowToDocument);
  }
  const rows = await db.getAllAsync(
    'SELECT * FROM documents ORDER BY downloaded_at DESC LIMIT ?',
    [limit]
  );
  return rows.map(rowToDocument);
}

export async function getStarredDocuments(limit = 20, accountId?: string | null): Promise<Document[]> {
  const db = await getDatabase();
  if (accountId) {
    const rows = await db.getAllAsync(
      'SELECT * FROM documents WHERE is_starred = 1 AND account_id = ? ORDER BY downloaded_at DESC LIMIT ?',
      [accountId, limit]
    );
    return rows.map(rowToDocument);
  }
  const rows = await db.getAllAsync(
    'SELECT * FROM documents WHERE is_starred = 1 ORDER BY downloaded_at DESC LIMIT ?',
    [limit]
  );
  return rows.map(rowToDocument);
}

export async function getDocumentStats(accountId?: string | null): Promise<{ total: number; totalSize: number }> {
  const db = await getDatabase();
  if (accountId) {
    const row: any = await db.getFirstAsync(
      'SELECT COUNT(*) as total, COALESCE(SUM(file_size), 0) as total_size FROM documents WHERE account_id = ?',
      [accountId]
    );
    return { total: row?.total ?? 0, totalSize: row?.total_size ?? 0 };
  }
  const row: any = await db.getFirstAsync(
    'SELECT COUNT(*) as total, COALESCE(SUM(file_size), 0) as total_size FROM documents'
  );
  return { total: row?.total ?? 0, totalSize: row?.total_size ?? 0 };
}

export async function getDocumentsByCategory(): Promise<{ category: string; count: number; totalSize: number }[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT category, COUNT(*) as count, COALESCE(SUM(file_size), 0) as total_size
     FROM documents GROUP BY category ORDER BY count DESC`
  );
  return (rows as any[]).map(r => ({ category: r.category, count: r.count, totalSize: r.total_size }));
}

export async function getDocumentsByMonth(months = 12): Promise<{ month: string; count: number }[]> {
  const db = await getDatabase();
  // Use exact date arithmetic instead of the 30-days-per-month approximation
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);
  const rows = await db.getAllAsync(
    `SELECT strftime('%Y-%m', datetime(email_date/1000, 'unixepoch')) as month, COUNT(*) as count
     FROM documents
     WHERE email_date >= ?
     GROUP BY month ORDER BY month ASC`,
    [since.getTime()]
  );
  return (rows as any[]).map(r => ({ month: r.month, count: r.count }));
}

export async function getTopSenders(limit = 8): Promise<{ name: string; email: string; count: number; totalSize: number }[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT
       COALESCE(NULLIF(sender_name, ''), sender_email) as name,
       sender_email as email,
       COUNT(*) as count,
       COALESCE(SUM(file_size), 0) as total_size
     FROM documents
     WHERE sender_email IS NOT NULL AND sender_email != ''
     GROUP BY sender_email ORDER BY count DESC LIMIT ?`,
    [limit]
  );
  return (rows as any[]).map(r => ({ name: r.name, email: r.email, count: r.count, totalSize: r.total_size }));
}

export async function getDocumentsByFileType(): Promise<{ ext: string; count: number }[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT file_extension as ext, COUNT(*) as count FROM documents GROUP BY file_extension ORDER BY count DESC`
  );
  return (rows as any[]).map(r => ({ ext: r.ext, count: r.count }));
}
