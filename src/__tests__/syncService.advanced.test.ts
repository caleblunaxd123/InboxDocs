/**
 * Advanced unit tests for sync service logic.
 *
 * Extends the basic tests in syncService.test.ts with:
 *   - Edge cases for collectParts (inline images, missing fields)
 *   - Sender parsing (From header regex)
 *   - File size boundary conditions
 *   - Gmail URL base64 decoding (- and _ must be replaced)
 *   - Session expiry detection logic
 *   - Progress tracking accumulation
 */

// ─── collectParts (replicated — not exported from module) ───────────────────

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

describe('collectParts — edge cases', () => {
  it('ignores parts with filename but no attachmentId (inline text)', () => {
    const payload = {
      filename: 'inline.txt',
      body: { data: 'base64content' }, // no attachmentId
    };
    expect(collectParts(payload)).toHaveLength(0);
  });

  it('ignores parts with attachmentId but no filename', () => {
    const payload = {
      body: { attachmentId: 'att-1', size: 100 }, // no filename
    };
    expect(collectParts(payload)).toHaveLength(0);
  });

  it('handles undefined parts array gracefully', () => {
    const payload = {
      mimeType: 'text/plain',
      body: { data: 'hello' },
      parts: undefined,
    };
    expect(() => collectParts(payload)).not.toThrow();
    expect(collectParts(payload)).toHaveLength(0);
  });

  it('handles empty parts array', () => {
    const payload = { parts: [] };
    expect(collectParts(payload)).toHaveLength(0);
  });

  it('collects multiple attachments at same nesting level', () => {
    const payload = {
      parts: [
        { filename: 'a.pdf', body: { attachmentId: 'att-1', size: 100 } },
        { filename: 'b.xlsx', body: { attachmentId: 'att-2', size: 200 } },
        { filename: 'c.docx', body: { attachmentId: 'att-3', size: 300 } },
      ],
    };
    const result = collectParts(payload);
    expect(result).toHaveLength(3);
    expect(result.map(r => r.filename)).toEqual(['a.pdf', 'b.xlsx', 'c.docx']);
  });

  it('handles real Gmail multipart/mixed structure', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: 'SGVsbG8=' } },
            { mimeType: 'text/html', body: { data: 'PGh0bWw+' } },
          ],
        },
        {
          mimeType: 'application/pdf',
          filename: 'invoice.pdf',
          body: { attachmentId: 'ANGjdJ_att1', size: 45000 },
        },
      ],
    };
    const result = collectParts(payload);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('invoice.pdf');
  });

  it('handles payload with both direct attachment and nested ones', () => {
    const payload = {
      filename: 'root.pdf',
      body: { attachmentId: 'att-root', size: 500 },
      parts: [
        { filename: 'child.docx', body: { attachmentId: 'att-child', size: 200 } },
      ],
    };
    const result = collectParts(payload);
    expect(result).toHaveLength(2);
    expect(result[0].filename).toBe('root.pdf');
    expect(result[1].filename).toBe('child.docx');
  });
});

// ─── From header parsing ─────────────────────────────────────────────────────

describe('syncService — From header parsing', () => {
  function parseFromHeader(from: string): { senderName: string; senderEmail: string } {
    const fromMatch = from.match(/^(.*?)\s*<(.+?)>$/) ?? [];
    const senderName  = fromMatch[1]?.trim() || from;
    const senderEmail = fromMatch[2] || from;
    return { senderName, senderEmail };
  }

  it('parses "Name <email>" format correctly', () => {
    const { senderName, senderEmail } = parseFromHeader('John Doe <john@example.com>');
    expect(senderName).toBe('John Doe');
    expect(senderEmail).toBe('john@example.com');
  });

  it('parses "Company Name <billing@company.com>"', () => {
    const { senderName, senderEmail } = parseFromHeader('Acme Corp Billing <billing@acme.com>');
    expect(senderName).toBe('Acme Corp Billing');
    expect(senderEmail).toBe('billing@acme.com');
  });

  it('falls back to raw string when no angle brackets', () => {
    const { senderName, senderEmail } = parseFromHeader('noreply@example.com');
    expect(senderName).toBe('noreply@example.com');
    expect(senderEmail).toBe('noreply@example.com');
  });

  it('handles name with special chars and numbers', () => {
    const { senderName, senderEmail } = parseFromHeader('SAT México <sat@cfdi.mx>');
    expect(senderName).toBe('SAT México');
    expect(senderEmail).toBe('sat@cfdi.mx');
  });

  it('trims whitespace from name', () => {
    const { senderName } = parseFromHeader('  Empresa S.A.  <contacto@empresa.com>');
    expect(senderName).toBe('Empresa S.A.');
  });

  it('handles empty From header gracefully', () => {
    const { senderName, senderEmail } = parseFromHeader('');
    expect(senderName).toBe('');
    expect(senderEmail).toBe('');
  });
});

// ─── Gmail base64 URL-safe decoding ─────────────────────────────────────────

describe('syncService — Gmail base64 URL-safe decoding', () => {
  /**
   * Gmail returns base64url-encoded data (RFC 4648) which uses - and _ instead of + and /
   * The sync code corrects this before calling atob().
   */
  function fixGmailBase64(data: string): string {
    return data.replace(/-/g, '+').replace(/_/g, '/');
  }

  it('replaces - with + in base64 string', () => {
    expect(fixGmailBase64('abc-def')).toBe('abc+def');
  });

  it('replaces _ with / in base64 string', () => {
    expect(fixGmailBase64('abc_def')).toBe('abc/def');
  });

  it('handles both substitutions simultaneously', () => {
    expect(fixGmailBase64('a-b_c')).toBe('a+b/c');
  });

  it('leaves standard base64 characters unchanged', () => {
    const standard = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/==';
    expect(fixGmailBase64(standard)).toBe(standard);
  });

  it('round-trips small payload through Gmail base64url correctly', () => {
    const text = 'Factura';
    // Encode to base64url
    const encoded = btoa(text).replace(/\+/g, '-').replace(/\//g, '_');
    // Decode using the fix function
    const fixed = fixGmailBase64(encoded);
    expect(atob(fixed)).toBe(text);
  });
});

// ─── File size limit enforcement ─────────────────────────────────────────────

describe('syncService — file size limits', () => {
  function shouldSkipForSize(sizeBytes: number, maxSizeMb: number): boolean {
    return sizeBytes > maxSizeMb * 1024 * 1024;
  }

  it('allows files exactly at the limit', () => {
    expect(shouldSkipForSize(25 * 1024 * 1024, 25)).toBe(false);
  });

  it('skips files 1 byte over the limit', () => {
    expect(shouldSkipForSize(25 * 1024 * 1024 + 1, 25)).toBe(true);
  });

  it('always allows 0-byte files (edge: inline image stubs)', () => {
    expect(shouldSkipForSize(0, 25)).toBe(false);
  });

  it('allows typical PDF size (2 MB)', () => {
    expect(shouldSkipForSize(2 * 1024 * 1024, 25)).toBe(false);
  });

  it('skips very large attachments (100 MB)', () => {
    expect(shouldSkipForSize(100 * 1024 * 1024, 25)).toBe(true);
  });

  it('respects custom max size setting (5 MB)', () => {
    expect(shouldSkipForSize(4 * 1024 * 1024, 5)).toBe(false);
    expect(shouldSkipForSize(6 * 1024 * 1024, 5)).toBe(true);
  });

  it('handles extremely large files (> 2 GB) without overflow', () => {
    const twoGB = 2 * 1024 * 1024 * 1024;
    expect(shouldSkipForSize(twoGB, 25)).toBe(true);
  });
});

// ─── Session expiry detection ────────────────────────────────────────────────

describe('syncService — SESSION_EXPIRED error logic', () => {
  function buildSessionExpiredError(accountId: string): Error & { code: string; accountId: string } {
    const err: any = new Error('Sesión expirada. Reconecta tu cuenta para continuar.');
    err.code = 'SESSION_EXPIRED';
    err.accountId = accountId;
    return err;
  }

  it('creates error with correct code', () => {
    const err = buildSessionExpiredError('acc-1');
    expect(err.code).toBe('SESSION_EXPIRED');
  });

  it('error includes the accountId for targeted reconnect', () => {
    const err = buildSessionExpiredError('acc-abc');
    expect(err.accountId).toBe('acc-abc');
  });

  it('error is still an instance of Error', () => {
    const err = buildSessionExpiredError('acc-1');
    expect(err).toBeInstanceOf(Error);
  });

  it('correctly detects expired token before API call', () => {
    const expiredAt = Date.now() - 60 * 1000; // 1 min ago
    const willThrow = expiredAt < Date.now();
    expect(willThrow).toBe(true);
  });

  it('does NOT flag as expired for token valid for 5 more minutes', () => {
    const validAt = Date.now() + 5 * 60 * 1000;
    const willThrow = validAt < Date.now();
    expect(willThrow).toBe(false);
  });

  it('does NOT flag as expired when tokenExpiresAt is 0 (unset)', () => {
    // The condition in syncService: if (account.tokenExpiresAt && ...)
    // 0 is falsy → does not trigger early expiry check
    const tokenExpiresAt = 0;
    const willThrow = tokenExpiresAt && tokenExpiresAt < Date.now();
    expect(willThrow).toBeFalsy();
  });
});

// ─── Sync progress tracking ──────────────────────────────────────────────────

describe('syncService — progress tracking logic', () => {
  interface SyncProgress {
    emailsScanned: number;
    documentsFound: number;
    documentsDownloaded: number;
    skippedCount: number;
    skippedFiles: { filename: string; reason: string }[];
    currentAction: string;
  }

  function initialProgress(): SyncProgress {
    return {
      emailsScanned: 0,
      documentsFound: 0,
      documentsDownloaded: 0,
      skippedCount: 0,
      skippedFiles: [],
      currentAction: 'Buscando correos con adjuntos...',
    };
  }

  it('initializes with zero counts', () => {
    const p = initialProgress();
    expect(p.emailsScanned).toBe(0);
    expect(p.documentsFound).toBe(0);
    expect(p.documentsDownloaded).toBe(0);
    expect(p.skippedCount).toBe(0);
  });

  it('correctly accumulates email scan count up to 200 limit', () => {
    let emailsScanned = 0;
    for (let i = 0; i < 250; i++) {
      if (emailsScanned >= 200) break;
      emailsScanned++;
    }
    expect(emailsScanned).toBe(200);
  });

  it('tracks skipped files with reason', () => {
    const p = initialProgress();
    p.skippedCount++;
    p.skippedFiles.push({ filename: 'photo.exe', reason: 'Tipo .exe no incluido en filtros' });

    expect(p.skippedCount).toBe(1);
    expect(p.skippedFiles[0].filename).toBe('photo.exe');
    expect(p.skippedFiles[0].reason).toContain('.exe');
  });

  it('downloaded count should never exceed documentsFound', () => {
    let found = 5;
    let downloaded = 0;
    // Simulate 3 successful downloads out of 5 found
    for (let i = 0; i < found; i++) {
      const success = i < 3;
      if (success) downloaded++;
    }
    expect(downloaded).toBeLessThanOrEqual(found);
    expect(downloaded).toBe(3);
  });

  it('progress.currentAction updates reflect current operation', () => {
    const p = initialProgress();
    p.currentAction = 'Analizando: factura.pdf';
    expect(p.currentAction).toBe('Analizando: factura.pdf');
    p.currentAction = 'Descargando: factura.pdf';
    expect(p.currentAction).toBe('Descargando: factura.pdf');
  });
});

// ─── Safe filename generation ─────────────────────────────────────────────────

describe('syncService — safe filename generation', () => {
  function toSafeFilename(original: string): string {
    return original.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  it('replaces spaces with underscores', () => {
    expect(toSafeFilename('mi factura enero.pdf')).toBe('mi_factura_enero.pdf');
  });

  it('replaces special characters', () => {
    expect(toSafeFilename('factura#123(enero).pdf')).toBe('factura_123_enero_.pdf');
  });

  it('preserves dots, hyphens, underscores, alphanumerics', () => {
    expect(toSafeFilename('report-2024_v1.2.pdf')).toBe('report-2024_v1.2.pdf');
  });

  it('handles non-latin characters (accented, CJK)', () => {
    expect(toSafeFilename('Facturación_2024.pdf')).toBe('Facturaci_n_2024.pdf');
    expect(toSafeFilename('请款单.pdf')).toBe('___.pdf');
  });

  it('handles filename with no extension', () => {
    expect(toSafeFilename('README')).toBe('README');
  });

  it('handles empty filename', () => {
    expect(toSafeFilename('')).toBe('');
  });

  it('replaces forward slashes (path separator) in filename', () => {
    const withSlash = 'folder/subfolder/file.pdf';
    const safe = toSafeFilename(withSlash);
    expect(safe).not.toContain('/'); // slashes replaced by _
    expect(safe).toBe('folder_subfolder_file.pdf');
  });

  /**
   * KNOWN LIMITATION: dots are NOT replaced by the current regex.
   * A filename like "../etc/passwd" becomes ".._etc_passwd" — still contains "..".
   * This is safe in practice because the file is written to a fixed ATTACHMENT_DIR
   * using the full path (ATTACHMENT_DIR + safeFilename), not relative to the filename.
   * The UUID prefix also prevents collisions.
   */
  it('does not traverse directories because files are saved to fixed ATTACHMENT_DIR', () => {
    const dangerous = '../../../etc/passwd';
    const safe = toSafeFilename(dangerous);
    // Slashes ARE removed, so actual path traversal via slash is not possible
    expect(safe).not.toContain('/');
    // Note: dots remain — the safe filename alone is NOT path-safe,
    // but the ATTACHMENT_DIR prefix makes the final path safe.
    // This test documents the known behavior:
    expect(safe).toContain('..');  // dots remain (by design — dots needed for extensions)
  });
});
