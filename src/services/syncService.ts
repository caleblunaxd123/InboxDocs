import axios from 'axios';
import * as FileSystem from 'expo-file-system/legacy';
import { Account } from '../types';
import { documentExists, insertDocument } from '../database/documents';
import { updateAccountLastSync, updateAccountTokens } from '../database/accounts';
import { categorizeDocument } from './aiService';
import { refreshGoogleToken, refreshMicrosoftToken } from './authService';
import { extractAndPersistInvoice } from './invoiceService';
import { getAllSettings } from '../database/settings';
import { v4 as uuidv4 } from 'uuid';
import { ATTACHMENT_DIR } from '../constants';

/**
 * Convierte un ArrayBuffer a string base64 en chunks de 8 KB.
 * Evita el O(n) de concatenación de strings que congela el hilo JS
 * con archivos grandes (problema original en la versión Outlook).
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as any);
  }
  return btoa(binary);
}

/** Margen de seguridad: refrescar si el token expira en menos de 5 minutos. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Per-account mutex: previene que dos syncs del mismo accountId corran en paralelo.
 * Cubre el caso background-sync vs manual-sync simultáneos.
 */
const syncLocks = new Map<string, boolean>();

/**
 * Set de accountIds cuyo sync ha sido cancelado por el usuario.
 * El loop de sync comprueba este set en cada email y lanza SYNC_CANCELLED.
 */
const cancelRequests = new Set<string>();

/**
 * Solicita la cancelación del sync en curso para la cuenta dada.
 * El sync se detendrá antes del próximo email procesado.
 */
export function cancelSync(accountId: string): void {
  cancelRequests.add(accountId);
}

/**
 * Garantiza que la cuenta tiene un access token válido antes del sync.
 * Si el token está por expirar o ya expiró, lo refresca automáticamente.
 * Retorna la cuenta con el token actualizado, o lanza SESSION_EXPIRED si no se puede.
 */
async function ensureFreshToken(account: Account): Promise<Account> {
  const expiresAt = account.tokenExpiresAt ?? 0;
  if (expiresAt > Date.now() + REFRESH_MARGIN_MS) {
    return account; // Token válido con margen suficiente
  }

  try {
    if (account.provider === 'gmail') {
      const { accessToken, expiresAt: newExp } = await refreshGoogleToken();
      await updateAccountTokens(account.id, accessToken, account.refreshTokenEncrypted, newExp);
      return { ...account, accessTokenEncrypted: accessToken, tokenExpiresAt: newExp };
    } else {
      const { accessToken, expiresAt: newExp } = await refreshMicrosoftToken(account.refreshTokenEncrypted);
      await updateAccountTokens(account.id, accessToken, account.refreshTokenEncrypted, newExp);
      return { ...account, accessTokenEncrypted: accessToken, tokenExpiresAt: newExp };
    }
  } catch {
    const err: any = new Error('Sesión expirada. Reconecta tu cuenta para continuar.');
    err.code = 'SESSION_EXPIRED';
    err.accountId = account.id;
    throw err;
  }
}

export interface SkippedFile {
  filename: string;
  reason: string;
}

export interface SyncProgress {
  emailsScanned: number;
  documentsFound: number;
  documentsDownloaded: number;
  skippedCount: number;
  skippedFiles: SkippedFile[];
  currentAction: string;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(ATTACHMENT_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ATTACHMENT_DIR, { intermediates: true });
  }
}

/**
 * Ensures the account token is still valid; refreshes it if expired.
 * Returns the (possibly updated) account object.
 */
export async function ensureFreshToken(account: Account): Promise<Account> {
  if (account.tokenExpiresAt && account.tokenExpiresAt > Date.now() + 60_000) {
    return account; // still valid (with 1-min buffer)
  }

  const { refreshGoogleToken, refreshMicrosoftToken } = await import('./authService');
  const refreshFn = account.provider === 'gmail' ? refreshGoogleToken : refreshMicrosoftToken;
  const { accessToken, expiresAt } = await refreshFn(account.refreshTokenEncrypted);

  await updateAccountTokens(account.id, accessToken, account.refreshTokenEncrypted, expiresAt);

  return { ...account, accessTokenEncrypted: accessToken, tokenExpiresAt: expiresAt };
}

/**
 * Recursively collects attachment parts from a Gmail message payload.
 * Defined at module level — not inside the message loop.
 */
export function collectParts(payload: any): any[] {
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
  toDate?: Date,
  allowedExtensions?: string[],
): Promise<number> {
  // Lock: evita dos syncs simultáneos para la misma cuenta
  if (syncLocks.get(account.id)) {
    console.warn(`[Sync] Gmail sync ya en curso para ${account.email} — ignorando llamada duplicada`);
    return 0;
  }
  syncLocks.set(account.id, true);

  try {
  account = await ensureFreshToken(account);

  await ensureDir();
  const settings = await getAllSettings();
  // Max file size limit prevents very large attachments from consuming storage (default 25 MB)
  const maxSizeBytes = settings.max_file_size_mb * 1024 * 1024;
  // Use parameter override if provided, otherwise fall back to persisted settings
  const extensionList = allowedExtensions ?? settings.allowed_extensions;
  const allowed = new Set(extensionList.map((e) => e.toLowerCase()));

  const progress: SyncProgress = {
    emailsScanned: 0,
    documentsFound: 0,
    documentsDownloaded: 0,
    skippedCount: 0,
    skippedFiles: [],
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

  // Gmail's "after:" works at DAY granularity (YYYY/MM/DD), NOT exact timestamps.
  // Using epoch seconds causes Gmail to re-scan the same day's emails on every sync.
  // Fix: use YYYY/MM/DD format and start from the day AFTER last sync to avoid duplicates.
  const sinceDate = account.lastSyncAt
    ? new Date(account.lastSyncAt)
    : new Date(account.syncFromDate);

  // Format as YYYY/MM/DD for Gmail query (their documented format)
  const fmtDate = (d: Date) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  const afterStr = fmtDate(sinceDate);
  const beforeStr = toDate ? ` before:${fmtDate(toDate)}` : '';
  const afterQuery = `after:${afterStr}${beforeStr} has:attachment`;

  let pageToken: string | undefined;
  let downloaded = 0;

  do {
    const listRes = await api.get('/users/me/messages', {
      params: { q: afterQuery, maxResults: 50, pageToken },
    });
    const messages: { id: string }[] = listRes.data.messages ?? [];
    pageToken = listRes.data.nextPageToken;

    for (const msg of messages) {
      if (progress.emailsScanned >= 200) break;

      // Comprobar cancelación antes de cada email
      if (cancelRequests.has(account.id)) {
        cancelRequests.delete(account.id);
        const err: any = new Error('Sincronización cancelada por el usuario.');
        err.code = 'SYNC_CANCELLED';
        throw err;
      }

      progress.emailsScanned += 1;

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

        if (!allowed.has(ext)) {
          progress.skippedCount += 1;
          progress.skippedFiles.push({
            filename,
            reason: `Tipo .${ext} no incluido en filtros`,
          });
          onProgress({ ...progress });
          continue;
        }
        if (size > maxSizeBytes) {
          progress.skippedCount += 1;
          progress.skippedFiles.push({
            filename,
            reason: `Excede ${settings.max_file_size_mb} MB`,
          });
          onProgress({ ...progress });
          continue;
        }

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

          const docRecord = {
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
          };
          const inserted = await insertDocument(docRecord);

          if (!inserted) {
            // Race condition: otro sync paralelo ya insertó este adjunto.
            // Eliminar el archivo descargado para no dejar huérfanos en disco.
            FileSystem.deleteAsync(filePath, { idempotent: true }).catch(() => {});
          } else {
            // Extract SUNAT invoice data for XML attachments
            if (ext === 'xml') {
              extractAndPersistInvoice(docRecord).catch((e) =>
                console.warn('[Sync] Invoice extraction failed:', e)
              );
            }
            progress.documentsDownloaded++;
            downloaded++;
          }
        } catch (err) {
          console.warn(`[Sync] Failed to download Gmail attachment ${filename}:`, err);
        }
      }
    }
  } while (pageToken && progress.emailsScanned < 200);

  await updateAccountLastSync(account.id, Date.now());
  return downloaded;
  } finally {
    syncLocks.delete(account.id);
  }
}

// ─── Outlook / Microsoft Graph ────────────────────────────────────────────────

export async function syncOutlookAccount(
  account: Account,
  onProgress: SyncProgressCallback,
  toDate?: Date,
  allowedExtensions?: string[],
): Promise<number> {
  // Lock: evita dos syncs simultáneos para la misma cuenta
  if (syncLocks.get(account.id)) {
    console.warn(`[Sync] Outlook sync ya en curso para ${account.email} — ignorando llamada duplicada`);
    return 0;
  }
  syncLocks.set(account.id, true);

  try {
  account = await ensureFreshToken(account);

  await ensureDir();
  const settings = await getAllSettings();
  // Max file size limit prevents very large attachments from consuming storage (default 25 MB)
  const maxSizeBytes = settings.max_file_size_mb * 1024 * 1024;
  // Use parameter override if provided, otherwise fall back to persisted settings
  const extensionList = allowedExtensions ?? settings.allowed_extensions;
  const allowed = new Set(extensionList.map((e) => e.toLowerCase()));

  const progress: SyncProgress = {
    emailsScanned: 0,
    documentsFound: 0,
    documentsDownloaded: 0,
    skippedCount: 0,
    skippedFiles: [],
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
  const toDateFilter = toDate
    ? ` and receivedDateTime le ${toDate.toISOString()}`
    : '';
  let url = `/me/messages?$filter=hasAttachments eq true and receivedDateTime ge ${sinceDate.toISOString()}${toDateFilter}&$select=id,subject,from,receivedDateTime&$top=50`;

  do {
    const res = await api.get(url);
    const messages: any[] = res.data.value ?? [];
    const nextLink: string | undefined = res.data['@odata.nextLink'];

    for (const msg of messages) {
      if (progress.emailsScanned >= 200) break;

      // Comprobar cancelación antes de cada email
      if (cancelRequests.has(account.id)) {
        cancelRequests.delete(account.id);
        const err: any = new Error('Sincronización cancelada por el usuario.');
        err.code = 'SYNC_CANCELLED';
        throw err;
      }

      progress.emailsScanned += 1;

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

        if (!allowed.has(ext)) {
          progress.skippedCount += 1;
          progress.skippedFiles.push({
            filename,
            reason: `Tipo .${ext} no incluido en filtros`,
          });
          onProgress({ ...progress });
          continue;
        }
        if (size > maxSizeBytes) {
          progress.skippedCount += 1;
          progress.skippedFiles.push({
            filename,
            reason: `Excede ${settings.max_file_size_mb} MB`,
          });
          onProgress({ ...progress });
          continue;
        }

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

          const base64Data = arrayBufferToBase64(contentRes.data as ArrayBuffer);
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

          const docRecord = {
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
          };
          const inserted = await insertDocument(docRecord);

          if (!inserted) {
            // Race condition: otro sync paralelo ya insertó este adjunto.
            // Eliminar el archivo descargado para no dejar huérfanos en disco.
            FileSystem.deleteAsync(filePath, { idempotent: true }).catch(() => {});
          } else {
            // Extract SUNAT invoice data for XML attachments
            if (ext === 'xml') {
              extractAndPersistInvoice(docRecord).catch((e) =>
                console.warn('[Sync] Invoice extraction failed:', e)
              );
            }
            progress.documentsDownloaded++;
            downloaded++;
          }
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
  } finally {
    syncLocks.delete(account.id);
  }
}
