import axios from 'axios';
import * as FileSystem from 'expo-file-system/legacy';
import { Account } from '../types';
import { documentExists, insertDocument } from '../database/documents';
import { updateAccountLastSync } from '../database/accounts';
import { categorizeDocument } from './aiService';
import { getAllSettings } from '../database/settings';
import { v4 as uuidv4 } from 'uuid';
import { ATTACHMENT_DIR } from '../constants';

export interface SyncProgress {
  emailsScanned: number;
  documentsFound: number;
  documentsDownloaded: number;
  currentAction: string;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(ATTACHMENT_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ATTACHMENT_DIR, { intermediates: true });
  }
}

function getMimeExtension(mimeType: string, fallback: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/heic': 'heic',
    'image/webp': 'webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/xml': 'xml',
    'application/xml': 'xml',
    'text/plain': 'txt',
  };
  return map[mimeType] ?? fallback;
}

/**
 * Recursively collects attachment parts from a Gmail message payload.
 * Defined at module level — not inside the message loop.
 */
function collectParts(payload: any): any[] {
  if (!payload) return [];
  const result: any[] = [];
  if (payload.filename && payload.body?.attachmentId) {
    result.push(payload);
  }
  for (const part of payload.parts ?? []) {
    result.push(...collectParts(part));
  }
  return result;
}

// ─── Gmail ────────────────────────────────────────────────────────────────────

export async function syncGmailAccount(
  account: Account,
  onProgress: SyncProgressCallback,
): Promise<number> {
  // Early expiry check — avoids a pointless API call that would 401 anyway
  if (account.tokenExpiresAt && account.tokenExpiresAt < Date.now()) {
    const err: any = new Error('Sesión expirada. Reconecta tu cuenta para continuar.');
    err.code = 'SESSION_EXPIRED';
    err.accountId = account.id;
    throw err;
  }

  await ensureDir();
  const settings     = await getAllSettings();
  const maxSizeBytes = settings.max_file_size_mb * 1024 * 1024;
  const allowed      = new Set(settings.allowed_extensions.map((e) => e.toLowerCase()));

  const progress: SyncProgress = {
    emailsScanned: 0,
    documentsFound: 0,
    documentsDownloaded: 0,
    currentAction: 'Buscando correos con adjuntos...',
  };

  const api = axios.create({
    baseURL: 'https://gmail.googleapis.com/gmail/v1',
    headers: { Authorization: `Bearer ${account.accessTokenEncrypted}` },
  });

  api.interceptors.response.use(
    (r) => r,
    (err) => {
      if (err.response?.status === 401) {
        const authErr: any = new Error('Sesión expirada. Reconecta tu cuenta para continuar.');
        authErr.code = 'SESSION_EXPIRED';
        authErr.accountId = account.id;
        throw authErr;
      }
      throw err;
    },
  );

  const sinceDate = account.lastSyncAt
    ? new Date(account.lastSyncAt)
    : new Date(account.syncFromDate);

  const afterQuery = `after:${Math.floor(sinceDate.getTime() / 1000)} has:attachment`;

  let pageToken: string | undefined;
  let downloaded = 0;

  do {
    const listRes = await api.get('/users/me/messages', {
      params: { q: afterQuery, maxResults: 50, pageToken },
    });
    const messages: { id: string }[] = listRes.data.messages ?? [];
    pageToken = listRes.data.nextPageToken;

    progress.emailsScanned += messages.length;

    for (const msg of messages) {
      if (progress.emailsScanned >= 200) break;

      await new Promise((r) => setTimeout(r, 100)); // respect rate limits

      const msgRes = await api.get(`/users/me/messages/${msg.id}`, {
        params: { format: 'full' },
      });

      const headers: { name: string; value: string }[] = msgRes.data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

      const subject  = getHeader('Subject');
      const from     = getHeader('From');
      const dateStr  = getHeader('Date');
      const emailDate = dateStr ? new Date(dateStr).getTime() : Date.now();

      const fromMatch  = from.match(/^(.*?)\s*<(.+?)>$/) ?? [];
      const senderName  = fromMatch[1]?.trim() || from;
      const senderEmail = fromMatch[2] || from;
      const snippet     = msgRes.data.snippet ?? '';

      const attachments = collectParts(msgRes.data.payload);

      for (const part of attachments) {
        const filename: string = part.filename;
        const ext      = filename.split('.').pop()?.toLowerCase() ?? '';
        const mimeType: string = part.mimeType ?? '';
        const size: number     = part.body.size ?? 0;

        if (!allowed.has(ext)) continue;
        if (size > maxSizeBytes) continue;

        progress.currentAction = `Analizando: ${filename}`;
        onProgress({ ...progress });

        const exists = await documentExists(account.id, msg.id, part.body.attachmentId);
        if (exists) continue;

        progress.documentsFound++;
        progress.currentAction = `Descargando: ${filename}`;
        onProgress({ ...progress });

        try {
          const attRes = await api.get(
            `/users/me/messages/${msg.id}/attachments/${part.body.attachmentId}`,
          );
          const base64Data: string = attRes.data.data.replace(/-/g, '+').replace(/_/g, '/');

          const safeFilename = `${uuidv4()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const filePath     = `${ATTACHMENT_DIR}${safeFilename}`;

          await FileSystem.writeAsStringAsync(filePath, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });

          const docId    = uuidv4();
          const category = await categorizeDocument(
            { filename, senderEmail, senderName, subject, fileExtension: ext, snippet },
            settings,
          );

          await insertDocument({
            id: docId,
            accountId: account.id,
            messageId: msg.id,
            attachmentId: part.body.attachmentId,
            filename: safeFilename,
            originalFilename: filename,
            filePath,
            fileSize: size,
            mimeType,
            fileExtension: ext,
            category: category.categoryId,
            categoryConfidence: category.confidence,
            senderEmail,
            senderName,
            subject,
            emailDate,
            downloadedAt: Date.now(),
            isStarred: false,
            notes: null,
          });

          progress.documentsDownloaded++;
          downloaded++;
        } catch (err) {
          console.warn(`[Sync] Failed to download Gmail attachment ${filename}:`, err);
        }
      }
    }
  } while (pageToken && progress.emailsScanned < 200);

  await updateAccountLastSync(account.id, Date.now());
  return downloaded;
}

// ─── Outlook / Microsoft Graph ────────────────────────────────────────────────

export async function syncOutlookAccount(
  account: Account,
  onProgress: SyncProgressCallback,
): Promise<number> {
  // Early expiry check
  if (account.tokenExpiresAt && account.tokenExpiresAt < Date.now()) {
    const err: any = new Error('Sesión expirada. Reconecta tu cuenta para continuar.');
    err.code = 'SESSION_EXPIRED';
    err.accountId = account.id;
    throw err;
  }

  await ensureDir();
  const settings     = await getAllSettings();
  const maxSizeBytes = settings.max_file_size_mb * 1024 * 1024;
  const allowed      = new Set(settings.allowed_extensions.map((e) => e.toLowerCase()));

  const progress: SyncProgress = {
    emailsScanned: 0,
    documentsFound: 0,
    documentsDownloaded: 0,
    currentAction: 'Buscando correos con adjuntos...',
  };

  const api = axios.create({
    baseURL: 'https://graph.microsoft.com/v1.0',
    headers: { Authorization: `Bearer ${account.accessTokenEncrypted}` },
  });

  api.interceptors.response.use(
    (r) => r,
    (err) => {
      if (err.response?.status === 401) {
        const authErr: any = new Error('Sesión expirada. Reconecta tu cuenta para continuar.');
        authErr.code = 'SESSION_EXPIRED';
        authErr.accountId = account.id;
        throw authErr;
      }
      throw err;
    },
  );

  const sinceDate = account.lastSyncAt
    ? new Date(account.lastSyncAt)
    : new Date(account.syncFromDate);

  let downloaded = 0;
  let url = `/me/messages?$filter=hasAttachments eq true and receivedDateTime ge ${sinceDate.toISOString()}&$select=id,subject,from,receivedDateTime&$top=50`;

  do {
    const res = await api.get(url);
    const messages: any[] = res.data.value ?? [];
    const nextLink: string | undefined = res.data['@odata.nextLink'];

    progress.emailsScanned += messages.length;

    for (const msg of messages) {
      if (progress.emailsScanned >= 200) break;

      const subject     = msg.subject ?? '';
      const senderEmail = msg.from?.emailAddress?.address ?? '';
      const senderName  = msg.from?.emailAddress?.name ?? senderEmail;
      const emailDate   = new Date(msg.receivedDateTime).getTime();

      let attachments: any[] = [];
      let retries = 0;
      while (retries < 3) {
        try {
          const attRes = await api.get(
            `/me/messages/${msg.id}/attachments?$select=id,name,contentType,size`,
          );
          attachments = attRes.data.value ?? [];
          break;
        } catch (err: any) {
          if (err.response?.status === 429) {
            const wait = parseInt(err.response.headers['retry-after'] ?? '5') * 1000;
            await new Promise((r) => setTimeout(r, wait));
            retries++;
          } else {
            throw err;
          }
        }
      }

      for (const att of attachments) {
        const filename: string = att.name ?? 'document';
        const ext      = filename.split('.').pop()?.toLowerCase() ?? '';
        const mimeType: string = att.contentType ?? '';
        const size: number     = att.size ?? 0;

        if (!allowed.has(ext)) continue;
        if (size > maxSizeBytes) continue;

        progress.currentAction = `Analizando: ${filename}`;
        onProgress({ ...progress });

        const exists = await documentExists(account.id, msg.id, att.id);
        if (exists) continue;

        progress.documentsFound++;
        progress.currentAction = `Descargando: ${filename}`;
        onProgress({ ...progress });

        try {
          const contentRes = await api.get(
            `/me/messages/${msg.id}/attachments/${att.id}/$value`,
            { responseType: 'arraybuffer' },
          );

          const base64Data   = Buffer.from(contentRes.data).toString('base64');
          const safeFilename = `${uuidv4()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const filePath     = `${ATTACHMENT_DIR}${safeFilename}`;

          await FileSystem.writeAsStringAsync(filePath, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });

          const docId    = uuidv4();
          const category = await categorizeDocument(
            { filename, senderEmail, senderName, subject, fileExtension: ext, snippet: '' },
            settings,
          );

          await insertDocument({
            id: docId,
            accountId: account.id,
            messageId: msg.id,
            attachmentId: att.id,
            filename: safeFilename,
            originalFilename: filename,
            filePath,
            fileSize: size,
            mimeType,
            fileExtension: ext,
            category: category.categoryId,
            categoryConfidence: category.confidence,
            senderEmail,
            senderName,
            subject,
            emailDate,
            downloadedAt: Date.now(),
            isStarred: false,
            notes: null,
          });

          progress.documentsDownloaded++;
          downloaded++;
        } catch (err) {
          console.warn(`[Sync] Failed to download Outlook attachment ${filename}:`, err);
        }
      }
    }

    if (nextLink) {
      url = nextLink.replace('https://graph.microsoft.com/v1.0', '');
    } else {
      break;
    }
  } while (progress.emailsScanned < 200);

  await updateAccountLastSync(account.id, Date.now());
  return downloaded;
}
