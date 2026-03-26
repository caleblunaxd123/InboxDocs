/**
 * Selective Download: Download specific attachments chosen by the user
 * from the Smart Inbox preview.
 */
import axios from 'axios';
import * as FileSystem from 'expo-file-system/legacy';
import { v4 as uuidv4 } from 'uuid';
import { Account, EmailPreview, AttachmentPreview } from '../types';
import { documentExists, insertDocument } from '../database/documents';
import { categorizeDocument } from './aiService';
import { getAllSettings } from '../database/settings';
import { ensureFreshToken } from './syncService';
import { ATTACHMENT_DIR } from '../constants';

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(ATTACHMENT_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ATTACHMENT_DIR, { intermediates: true });
  }
}

export interface DownloadProgress {
  current: number;
  total: number;
  filename: string;
}

export type DownloadProgressCallback = (p: DownloadProgress) => void;

/**
 * Download selected attachments from Gmail emails.
 */
async function downloadGmailAttachment(
  api: ReturnType<typeof axios.create>,
  messageId: string,
  attachment: AttachmentPreview,
  account: Account,
  emailMeta: { subject: string; senderName: string; senderEmail: string; emailDate: number },
): Promise<boolean> {
  const exists = await documentExists(account.id, messageId, attachment.id);
  if (exists) return false;

  const attRes = await api.get(
    `/users/me/messages/${messageId}/attachments/${attachment.id}`,
  );
  const base64Data: string = attRes.data.data.replace(/-/g, '+').replace(/_/g, '/');

  const safeFilename = `${uuidv4()}_${attachment.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = `${ATTACHMENT_DIR}${safeFilename}`;

  await FileSystem.writeAsStringAsync(filePath, base64Data, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const settings = await getAllSettings();
  const category = await categorizeDocument(
    {
      filename: attachment.filename,
      senderEmail: emailMeta.senderEmail,
      senderName: emailMeta.senderName,
      subject: emailMeta.subject,
      fileExtension: attachment.extension,
      snippet: '',
    },
    settings,
  );

  await insertDocument({
    id: uuidv4(),
    accountId: account.id,
    messageId,
    attachmentId: attachment.id,
    filename: safeFilename,
    originalFilename: attachment.filename,
    filePath,
    fileSize: attachment.size,
    mimeType: attachment.mimeType,
    fileExtension: attachment.extension,
    category: category.categoryId,
    categoryConfidence: category.confidence,
    senderEmail: emailMeta.senderEmail,
    senderName: emailMeta.senderName,
    subject: emailMeta.subject,
    emailDate: emailMeta.emailDate,
    downloadedAt: Date.now(),
    isStarred: false,
    notes: null,
  });

  return true;
}

/**
 * Download selected attachments from Outlook emails.
 */
async function downloadOutlookAttachment(
  api: ReturnType<typeof axios.create>,
  messageId: string,
  attachment: AttachmentPreview,
  account: Account,
  emailMeta: { subject: string; senderName: string; senderEmail: string; emailDate: number },
): Promise<boolean> {
  const exists = await documentExists(account.id, messageId, attachment.id);
  if (exists) return false;

  const attRes = await api.get(
    `/me/messages/${messageId}/attachments/${attachment.id}`,
  );
  const base64Data: string = attRes.data.contentBytes;

  const safeFilename = `${uuidv4()}_${attachment.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = `${ATTACHMENT_DIR}${safeFilename}`;

  await FileSystem.writeAsStringAsync(filePath, base64Data, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const settings = await getAllSettings();
  const category = await categorizeDocument(
    {
      filename: attachment.filename,
      senderEmail: emailMeta.senderEmail,
      senderName: emailMeta.senderName,
      subject: emailMeta.subject,
      fileExtension: attachment.extension,
      snippet: '',
    },
    settings,
  );

  await insertDocument({
    id: uuidv4(),
    accountId: account.id,
    messageId,
    attachmentId: attachment.id,
    filename: safeFilename,
    originalFilename: attachment.filename,
    filePath,
    fileSize: attachment.size,
    mimeType: attachment.mimeType,
    fileExtension: attachment.extension,
    category: category.categoryId,
    categoryConfidence: category.confidence,
    senderEmail: emailMeta.senderEmail,
    senderName: emailMeta.senderName,
    subject: emailMeta.subject,
    emailDate: emailMeta.emailDate,
    downloadedAt: Date.now(),
    isStarred: false,
    notes: null,
  });

  return true;
}

/**
 * Downloads selected attachments from email previews.
 * Returns the number of successfully downloaded files.
 */
export async function downloadSelectedAttachments(
  account: Account,
  selections: { email: EmailPreview; attachments: AttachmentPreview[] }[],
  onProgress?: DownloadProgressCallback,
): Promise<number> {
  account = await ensureFreshToken(account);
  await ensureDir();

  const totalAttachments = selections.reduce((sum, s) => sum + s.attachments.length, 0);
  let current = 0;
  let downloaded = 0;

  const isGmail = account.provider === 'gmail';
  const api = axios.create({
    baseURL: isGmail
      ? 'https://gmail.googleapis.com/gmail/v1'
      : 'https://graph.microsoft.com/v1.0',
    headers: { Authorization: `Bearer ${account.accessTokenEncrypted}` },
  });

  for (const { email, attachments } of selections) {
    const emailMeta = {
      subject: email.subject,
      senderName: email.senderName,
      senderEmail: email.senderEmail,
      emailDate: email.date,
    };

    for (const att of attachments) {
      current++;
      onProgress?.({ current, total: totalAttachments, filename: att.filename });

      try {
        const success = isGmail
          ? await downloadGmailAttachment(api, email.id, att, account, emailMeta)
          : await downloadOutlookAttachment(api, email.id, att, account, emailMeta);
        if (success) downloaded++;
      } catch (err) {
        console.warn(`[SelectiveDownload] Failed: ${att.filename}`, err);
      }

      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return downloaded;
}
