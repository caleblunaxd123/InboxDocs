/**
 * Smart Inbox: Fetch email metadata (subject, sender, attachment info)
 * WITHOUT downloading any files. Ultra fast — only API metadata calls.
 */
import axios from 'axios';
import { Account, EmailPreview, AttachmentPreview } from '../types';
import { documentExists } from '../database/documents';
import { ensureFreshToken, collectParts } from './syncService';

export interface PreviewProgress {
  emailsScanned: number;
  total: number;
  currentAction: string;
}

export type PreviewProgressCallback = (p: PreviewProgress) => void;

/**
 * Fetches email previews (metadata only) from Gmail.
 * Does NOT download any attachments — just lists what's available.
 */
export async function previewGmailEmails(
  account: Account,
  fromDate: Date,
  toDate: Date,
  onProgress?: PreviewProgressCallback,
): Promise<EmailPreview[]> {
  account = await ensureFreshToken(account);

  const api = axios.create({
    baseURL: 'https://gmail.googleapis.com/gmail/v1',
    headers: { Authorization: `Bearer ${account.accessTokenEncrypted}` },
  });

  const fmtDate = (d: Date) =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;

  const query = `after:${fmtDate(fromDate)} before:${fmtDate(toDate)} has:attachment`;
  const results: EmailPreview[] = [];
  let pageToken: string | undefined;
  let scanned = 0;

  do {
    const listRes = await api.get('/users/me/messages', {
      params: { q: query, maxResults: 50, pageToken },
    });
    const messages: { id: string }[] = listRes.data.messages ?? [];
    pageToken = listRes.data.nextPageToken;

    for (const msg of messages) {
      if (scanned >= 100) break; // Limit preview to 100 emails
      scanned++;
      onProgress?.({
        emailsScanned: scanned,
        total: Math.min(messages.length + (pageToken ? 50 : 0), 100),
        currentAction: `Escaneando correo ${scanned}...`,
      });

      // Use format=full to get attachment parts
      const msgRes = await api.get(`/users/me/messages/${msg.id}`, {
        params: { format: 'full' },
      });

      const headers: { name: string; value: string }[] = msgRes.data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

      const subject = getHeader('Subject');
      const from = getHeader('From');
      const dateStr = getHeader('Date');
      const emailDate = dateStr ? new Date(dateStr).getTime() : Date.now();

      const fromMatch = from.match(/^(.*?)\s*<(.+?)>$/) ?? [];
      const senderName = fromMatch[1]?.trim() || from;
      const senderEmail = fromMatch[2] || from;
      const snippet = msgRes.data.snippet ?? '';

      const parts = collectParts(msgRes.data.payload);
      if (parts.length === 0) continue; // No real attachments

      const attachments: AttachmentPreview[] = parts.map((part) => ({
        id: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType ?? '',
        size: part.body.size ?? 0,
        extension: part.filename.split('.').pop()?.toLowerCase() ?? '',
      }));

      // Check if ALL attachments are already downloaded
      let allDownloaded = true;
      for (const att of attachments) {
        const exists = await documentExists(account.id, msg.id, att.id);
        if (!exists) { allDownloaded = false; break; }
      }

      results.push({
        id: msg.id,
        accountId: account.id,
        provider: 'gmail',
        subject,
        senderName,
        senderEmail,
        date: emailDate,
        snippet,
        attachments,
        isAlreadyDownloaded: allDownloaded,
      });

      // Small delay to respect rate limits
      await new Promise((r) => setTimeout(r, 50));
    }
  } while (pageToken && scanned < 100);

  return results.sort((a, b) => b.date - a.date);
}

/**
 * Fetches email previews from Outlook / Microsoft Graph.
 */
export async function previewOutlookEmails(
  account: Account,
  fromDate: Date,
  toDate: Date,
  onProgress?: PreviewProgressCallback,
): Promise<EmailPreview[]> {
  account = await ensureFreshToken(account);

  const api = axios.create({
    baseURL: 'https://graph.microsoft.com/v1.0',
    headers: { Authorization: `Bearer ${account.accessTokenEncrypted}` },
  });

  const results: EmailPreview[] = [];
  let scanned = 0;
  const toDateFilter = ` and receivedDateTime le ${toDate.toISOString()}`;
  let url = `/me/messages?$filter=hasAttachments eq true and receivedDateTime ge ${fromDate.toISOString()}${toDateFilter}&$select=id,subject,from,receivedDateTime,bodyPreview&$top=50`;

  do {
    const res = await api.get(url);
    const messages: any[] = res.data.value ?? [];
    const nextLink: string | undefined = res.data['@odata.nextLink'];

    for (const msg of messages) {
      if (scanned >= 100) break;
      scanned++;
      onProgress?.({
        emailsScanned: scanned,
        total: Math.min(messages.length + (nextLink ? 50 : 0), 100),
        currentAction: `Escaneando correo ${scanned}...`,
      });

      const subject = msg.subject ?? '';
      const senderEmail = msg.from?.emailAddress?.address ?? '';
      const senderName = msg.from?.emailAddress?.name ?? senderEmail;
      const emailDate = new Date(msg.receivedDateTime).getTime();
      const snippet = msg.bodyPreview ?? '';

      // Fetch attachment metadata (no content)
      let attList: any[] = [];
      try {
        const attRes = await api.get(
          `/me/messages/${msg.id}/attachments?$select=id,name,contentType,size`,
        );
        attList = attRes.data.value ?? [];
      } catch {
        continue;
      }

      if (attList.length === 0) continue;

      const attachments: AttachmentPreview[] = attList.map((att) => ({
        id: att.id,
        filename: att.name ?? 'document',
        mimeType: att.contentType ?? '',
        size: att.size ?? 0,
        extension: (att.name ?? '').split('.').pop()?.toLowerCase() ?? '',
      }));

      let allDownloaded = true;
      for (const att of attachments) {
        const exists = await documentExists(account.id, msg.id, att.id);
        if (!exists) { allDownloaded = false; break; }
      }

      results.push({
        id: msg.id,
        accountId: account.id,
        provider: 'outlook',
        subject,
        senderName,
        senderEmail,
        date: emailDate,
        snippet,
        attachments,
        isAlreadyDownloaded: allDownloaded,
      });

      await new Promise((r) => setTimeout(r, 50));
    }

    if (nextLink) {
      url = nextLink.replace('https://graph.microsoft.com/v1.0', '');
    } else {
      break;
    }
  } while (scanned < 100);

  return results.sort((a, b) => b.date - a.date);
}
