import axios from 'axios';
import * as FileSystem from 'expo-file-system/legacy';
import { Account } from '../types';
import { documentExists, insertDocument } from '../database/documents';
import { updateAccountLastSync } from '../database/accounts';
import { categorizeDocument } from './aiService';
import { getAllSettings } from '../database/settings';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const ATTACHMENT_DIR = `${FileSystem.documentDirectory}inboxdocs/attachments/`;

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

// ─── Gmail ────────────────────────────────────────────────────────────────────

export async function syncGmailAccount(
  account: Account,
  onProgress: SyncProgressCallback
): Promise<number> {
  await ensureDir();
  const settings = await getAllSettings();
  const maxSizeBytes = settings.max_file_size_mb * 1024 * 1024;
  const allowed = new Set(settings.allowed_extensions.map((e) => e.toLowerCase()));

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

  let pageToken: string | undefined;
  let downloaded = 0;
  const sinceDate = account.lastSyncAt
    ? new Date(account.lastSyncAt)
    : new Date(Date.now() - settings.default_sync_from_days * 24 * 60 * 60 * 1000);

  const afterQuery = `after:${Math.floor(sinceDate.getTime() / 1000)} has:attachment`;

  do {
    const listRes = await api.get('/users/me/messages', {
      params: { q: afterQuery, maxResults: 50, pageToken },
    });
    const messages: { id: string }[] = listRes.data.messages ?? [];
    pageToken = listRes.data.nextPageToken;

    progress.emailsScanned += messages.length;

    for (const msg of messages) {
      if (progress.emailsScanned >= 200) break;

      // Small delay to respect rate limits
      await new Promise((r) => setTimeout(r, 100));

      const msgRes = await api.get(`/users/me/messages/${msg.id}`, {
        params: { format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] },
      });

      const headers: { name: string; value: string }[] = msgRes.data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

      const subject = getHeader('Subject');
      const from = getHeader('From');
      const dateStr = getHeader('Date');
      const emailDate = dateStr ? new Date(dateStr).getTime() : Date.now();

      // Parse sender
      const fromMatch = from.match(/^(.*?)\s*<(.+?)>$/) ?? [];
      const senderName = fromMatch[1]?.trim() || from;
      const senderEmail = fromMatch[2] || from;

      const snippet = msgRes.data.snippet ?? '';

      // Get attachments
      const parts = msgRes.data.payload?.parts ?? [];
      const attachments = parts.filter(
        (p: any) => p.filename && p.body?.attachmentId
      );

      for (const part of attachments) {
        const filename: string = part.filename;
        const ext = filename.split('.').pop()?.toLowerCase() ?? '';
        const mimeType: string = part.mimeType ?? '';
        const size: number = part.body.size ?? 0;

        if (!allowed.has(ext)) continue;
        if (size > maxSizeBytes) continue;

        progress.documentsFound++;
        progress.currentAction = `Descargando: ${filename}`;
        onProgress({ ...progress });

        const exists = await documentExists(account.id, msg.id, part.body.attachmentId);
        if (exists) continue;

        try {
          const attRes = await api.get(
            `/users/me/messages/${msg.id}/attachments/${part.body.attachmentId}`
          );
          const base64Data: string = attRes.data.data.replace(/-/g, '+').replace(/_/g, '/');

          const safeFilename = `${uuidv4()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const filePath = `${ATTACHMENT_DIR}${safeFilename}`;

          await FileSystem.writeAsStringAsync(filePath, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });

          const docId = uuidv4();
          const category = await categorizeDocument({
            filename,
            senderEmail,
            senderName,
            subject,
            fileExtension: ext,
            snippet,
          }, settings);

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
          console.warn(`Failed to download attachment ${filename}:`, err);
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
  onProgress: SyncProgressCallback
): Promise<number> {
  await ensureDir();
  const settings = await getAllSettings();
  const maxSizeBytes = settings.max_file_size_mb * 1024 * 1024;
  const allowed = new Set(settings.allowed_extensions.map((e) => e.toLowerCase()));

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

  const sinceDate = account.lastSyncAt
    ? new Date(account.lastSyncAt)
    : new Date(Date.now() - settings.default_sync_from_days * 24 * 60 * 60 * 1000);

  let nextLink: string | undefined = undefined;
  let downloaded = 0;
  let url = `/me/messages?$filter=hasAttachments eq true and receivedDateTime ge ${sinceDate.toISOString()}&$select=id,subject,from,receivedDateTime&$top=50`;

  do {
    const res = await api.get(url);
    const messages: any[] = res.data.value ?? [];
    nextLink = res.data['@odata.nextLink'];

    progress.emailsScanned += messages.length;

    for (const msg of messages) {
      if (progress.emailsScanned >= 200) break;

      const subject = msg.subject ?? '';
      const senderEmail = msg.from?.emailAddress?.address ?? '';
      const senderName = msg.from?.emailAddress?.name ?? senderEmail;
      const emailDate = new Date(msg.receivedDateTime).getTime();

      // Get attachments
      let retries = 0;
      let attachments: any[] = [];
      while (retries < 3) {
        try {
          const attRes = await api.get(`/me/messages/${msg.id}/attachments?$select=id,name,contentType,size`);
          attachments = attRes.data.value ?? [];
          break;
        } catch (err: any) {
          if (err.response?.status === 429) {
            const retryAfter = parseInt(err.response.headers['retry-after'] ?? '5') * 1000;
            await new Promise((r) => setTimeout(r, retryAfter));
            retries++;
          } else throw err;
        }
      }

      for (const att of attachments) {
        const filename: string = att.name ?? 'document';
        const ext = filename.split('.').pop()?.toLowerCase() ?? '';
        const mimeType: string = att.contentType ?? '';
        const size: number = att.size ?? 0;

        if (!allowed.has(ext)) continue;
        if (size > maxSizeBytes) continue;

        progress.documentsFound++;
        progress.currentAction = `Descargando: ${filename}`;
        onProgress({ ...progress });

        const exists = await documentExists(account.id, msg.id, att.id);
        if (exists) continue;

        try {
          const contentRes = await api.get(`/me/messages/${msg.id}/attachments/${att.id}/$value`, {
            responseType: 'arraybuffer',
          });

          const base64Data = Buffer.from(contentRes.data).toString('base64');
          const safeFilename = `${uuidv4()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const filePath = `${ATTACHMENT_DIR}${safeFilename}`;

          await FileSystem.writeAsStringAsync(filePath, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });

          const docId = uuidv4();
          const category = await categorizeDocument({
            filename,
            senderEmail,
            senderName,
            subject,
            fileExtension: ext,
            snippet: '',
          }, settings);

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
          console.warn(`Failed to download Outlook attachment ${filename}:`, err);
        }
      }
    }

    if (nextLink) {
      url = nextLink.replace('https://graph.microsoft.com/v1.0', '');
    }
  } while (nextLink && progress.emailsScanned < 200);

  await updateAccountLastSync(account.id, Date.now());
  return downloaded;
}
