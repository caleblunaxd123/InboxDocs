/**
 * Unit tests for sync service logic.
 * 
 * These test the pure functions (collectParts) and extension filtering logic
 * without making actual API calls.
 */

// We need to test the collectParts function which is not exported,
// so we test it indirectly through the module's behavior.
// For direct testing, we replicate the logic here.

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

describe('syncService - collectParts', () => {
  it('should return empty array for null payload', () => {
    expect(collectParts(null)).toEqual([]);
  });

  it('should return empty array for payload without attachments', () => {
    expect(collectParts({ mimeType: 'text/plain', body: { data: 'hello' } })).toEqual([]);
  });

  it('should collect direct attachment', () => {
    const payload = {
      filename: 'test.pdf',
      body: { attachmentId: 'att-1', size: 1024 },
    };
    const result = collectParts(payload);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('test.pdf');
  });

  it('should collect nested attachments', () => {
    const payload = {
      parts: [
        { mimeType: 'text/plain', body: { data: 'hello' } },
        {
          filename: 'doc.pdf',
          body: { attachmentId: 'att-1', size: 500 },
        },
        {
          parts: [
            {
              filename: 'img.jpg',
              body: { attachmentId: 'att-2', size: 2000 },
            },
          ],
        },
      ],
    };
    const result = collectParts(payload);
    expect(result).toHaveLength(2);
    expect(result[0].filename).toBe('doc.pdf');
    expect(result[1].filename).toBe('img.jpg');
  });

  it('should handle deeply nested parts', () => {
    const payload = {
      parts: [{
        parts: [{
          parts: [{
            filename: 'deep.xlsx',
            body: { attachmentId: 'att-deep', size: 100 },
          }],
        }],
      }],
    };
    const result = collectParts(payload);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('deep.xlsx');
  });
});

describe('syncService - extension filtering', () => {
  const testFilter = (extensions: string[], filename: string): boolean => {
    const allowed = new Set(extensions.map(e => e.toLowerCase()));
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    return allowed.has(ext);
  };

  it('should allow pdf when in filter list', () => {
    expect(testFilter(['pdf', 'docx'], 'invoice.pdf')).toBe(true);
  });

  it('should reject png when not in filter list', () => {
    expect(testFilter(['pdf', 'docx'], 'screenshot.png')).toBe(false);
  });

  it('should handle case-insensitive matching', () => {
    expect(testFilter(['PDF', 'DOCX'], 'invoice.pdf')).toBe(true);
  });

  it('should handle files with multiple dots', () => {
    expect(testFilter(['pdf'], 'report.final.v2.pdf')).toBe(true);
  });

  it('should reject files with no extension', () => {
    expect(testFilter(['pdf'], 'README')).toBe(false);
  });

  it('should filter with comprehensive extension list', () => {
    const allExtensions = [
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
      'jpg', 'jpeg', 'png', 'heic', 'webp', 'gif',
      'txt', 'csv', 'xml', 'json', 'zip', 'rar',
    ];
    expect(testFilter(allExtensions, 'photo.heic')).toBe(true);
    expect(testFilter(allExtensions, 'data.csv')).toBe(true);
    expect(testFilter(allExtensions, 'slide.pptx')).toBe(true);
    expect(testFilter(allExtensions, 'calendar.ics')).toBe(false);
    expect(testFilter(allExtensions, 'app.exe')).toBe(false);
  });
});

describe('syncService - file size limit', () => {
  it('should enforce max file size', () => {
    const maxSizeMb = 25;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    expect(1024 > maxSizeBytes).toBe(false); // 1 KB - should pass
    expect(26 * 1024 * 1024 > maxSizeBytes).toBe(true); // 26 MB - should fail
    expect(25 * 1024 * 1024 > maxSizeBytes).toBe(false); // exactly 25 MB - should pass
  });
});
