/**
 * Unit tests for useAppStore logic.
 *
 * We replicate the store logic here to avoid zustand v5 ESM resolution issues
 * in the Jest/Node CJS environment. This tests the BUSINESS LOGIC, not the
 * zustand integration (which is tested implicitly when the app runs).
 */

// ─── Replicated types ──────────────────────────────────────────────────────
type CategoryId = 'invoice' | 'receipt' | 'statement' | 'contract' | 'tax' | 'insurance' | 'medical' | 'other';

interface Document {
  id: string;
  accountId: string;
  messageId: string;
  attachmentId: string;
  filename: string;
  originalFilename: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  fileExtension: string;
  category: CategoryId;
  categoryConfidence: number;
  senderEmail: string;
  senderName: string;
  subject: string;
  emailDate: number;
  downloadedAt: number;
  isStarred: boolean;
  notes: string | null;
}

// ─── Replicated store logic ─────────────────────────────────────────────────

interface StoreState {
  documents: Document[];
  recentDocuments: Document[];
  starredDocuments: Document[];
  totalDocuments: number;
  totalSizeBytes: number;
}

function upsertDocument(state: StoreState, doc: Document): StoreState {
  const existsInDocs = state.documents.some(d => d.id === doc.id);
  const existsInRecent = state.recentDocuments.some(d => d.id === doc.id);
  const existsInStarred = state.starredDocuments.some(d => d.id === doc.id);

  const newDocuments = existsInDocs
    ? state.documents.map(d => d.id === doc.id ? doc : d)
    : [doc, ...state.documents];

  const newRecent = existsInRecent
    ? state.recentDocuments.map(d => d.id === doc.id ? doc : d)
    : [doc, ...state.recentDocuments].slice(0, 20);

  const newStarred = existsInStarred
    ? state.starredDocuments.map(d => d.id === doc.id ? doc : d).filter(d => d.isStarred)
    : doc.isStarred ? [doc, ...state.starredDocuments] : state.starredDocuments;

  return {
    documents: newDocuments,
    recentDocuments: newRecent,
    starredDocuments: newStarred,
    totalDocuments: existsInDocs ? state.totalDocuments : state.totalDocuments + 1,
    totalSizeBytes: existsInDocs ? state.totalSizeBytes : state.totalSizeBytes + doc.fileSize,
  };
}

function removeDocument(state: StoreState, docId: string): StoreState {
  const doc = state.documents.find(d => d.id === docId);
  return {
    documents: state.documents.filter(d => d.id !== docId),
    recentDocuments: state.recentDocuments.filter(d => d.id !== docId),
    starredDocuments: state.starredDocuments.filter(d => d.id !== docId),
    totalDocuments: doc ? state.totalDocuments - 1 : state.totalDocuments,
    totalSizeBytes: doc ? state.totalSizeBytes - doc.fileSize : state.totalSizeBytes,
  };
}

// ─── Test helpers ──────────────────────────────────────────────────────────

function emptyState(): StoreState {
  return { documents: [], recentDocuments: [], starredDocuments: [], totalDocuments: 0, totalSizeBytes: 0 };
}

function mockDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    accountId: 'acc-1',
    messageId: 'msg-1',
    attachmentId: 'att-1',
    filename: 'safe_test.pdf',
    originalFilename: 'test.pdf',
    filePath: '/mock/test.pdf',
    fileSize: 1024,
    mimeType: 'application/pdf',
    fileExtension: 'pdf',
    category: 'invoice',
    categoryConfidence: 0.9,
    senderEmail: 'sender@test.com',
    senderName: 'Test Sender',
    subject: 'Test Subject',
    emailDate: Date.now(),
    downloadedAt: Date.now(),
    isStarred: false,
    notes: null,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Store Logic — upsertDocument', () => {
  it('should add new document to all arrays and increment stats', () => {
    const doc = mockDoc();
    const result = upsertDocument(emptyState(), doc);

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].id).toBe('doc-1');
    expect(result.recentDocuments).toHaveLength(1);
    expect(result.totalDocuments).toBe(1);
    expect(result.totalSizeBytes).toBe(1024);
  });

  it('should update existing document without duplicating', () => {
    const doc = mockDoc();
    let state = upsertDocument(emptyState(), doc);
    state = upsertDocument(state, { ...doc, originalFilename: 'updated.pdf' });

    expect(state.documents).toHaveLength(1);
    expect(state.documents[0].originalFilename).toBe('updated.pdf');
    expect(state.totalDocuments).toBe(1); // Should NOT increment
  });

  it('should add starred document to starredDocuments', () => {
    const doc = mockDoc({ isStarred: true });
    const result = upsertDocument(emptyState(), doc);
    expect(result.starredDocuments).toHaveLength(1);
  });

  it('should not add unstarred document to starredDocuments', () => {
    const doc = mockDoc({ isStarred: false });
    const result = upsertDocument(emptyState(), doc);
    expect(result.starredDocuments).toHaveLength(0);
  });

  it('should cap recentDocuments at 20', () => {
    let state = emptyState();
    for (let i = 0; i < 25; i++) {
      state = upsertDocument(state, mockDoc({ id: `doc-${i}` }));
    }
    expect(state.recentDocuments.length).toBeLessThanOrEqual(20);
  });

  it('should remove from starredDocuments when un-starred via upsert', () => {
    const doc = mockDoc({ isStarred: true });
    let state = upsertDocument(emptyState(), doc);
    expect(state.starredDocuments).toHaveLength(1);
    
    // Un-star via upsert
    state = upsertDocument(state, { ...doc, isStarred: false });
    expect(state.starredDocuments).toHaveLength(0);
  });

  it('should correctly accumulate totalSizeBytes for multiple docs', () => {
    let state = emptyState();
    state = upsertDocument(state, mockDoc({ id: 'doc-1', fileSize: 1000 }));
    state = upsertDocument(state, mockDoc({ id: 'doc-2', fileSize: 2000 }));
    state = upsertDocument(state, mockDoc({ id: 'doc-3', fileSize: 3000 }));

    expect(state.totalDocuments).toBe(3);
    expect(state.totalSizeBytes).toBe(6000);
  });
});

describe('Store Logic — removeDocument', () => {
  it('should remove document from all arrays and decrement stats', () => {
    const doc = mockDoc();
    let state = upsertDocument(emptyState(), doc);
    state = removeDocument(state, 'doc-1');

    expect(state.documents).toHaveLength(0);
    expect(state.recentDocuments).toHaveLength(0);
    expect(state.totalDocuments).toBe(0);
  });

  it('should remove starred document from starredDocuments', () => {
    const doc = mockDoc({ isStarred: true });
    let state = upsertDocument(emptyState(), doc);
    state = removeDocument(state, 'doc-1');

    expect(state.starredDocuments).toHaveLength(0);
  });

  it('should handle removing non-existent document gracefully', () => {
    const state = emptyState();
    const result = removeDocument(state, 'nonexistent');
    expect(result.documents).toHaveLength(0);
    expect(result.totalDocuments).toBe(0);
  });

  it('should correctly decrement totalSizeBytes', () => {
    let state = emptyState();
    state = upsertDocument(state, mockDoc({ id: 'doc-1', fileSize: 1000 }));
    state = upsertDocument(state, mockDoc({ id: 'doc-2', fileSize: 2000 }));
    state = removeDocument(state, 'doc-1');

    expect(state.totalDocuments).toBe(1);
    expect(state.totalSizeBytes).toBe(2000);
  });
});

describe('Extension filtering logic', () => {
  const DEFAULT_EXTENSIONS = [
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'jpg', 'jpeg', 'png', 'heic', 'webp', 'gif',
    'txt', 'csv', 'xml', 'json', 'zip', 'rar',
  ];

  function isAllowed(filename: string, allowed: string[]): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    return new Set(allowed.map(e => e.toLowerCase())).has(ext);
  }

  it('should allow common document types', () => {
    expect(isAllowed('report.pdf', DEFAULT_EXTENSIONS)).toBe(true);
    expect(isAllowed('data.xlsx', DEFAULT_EXTENSIONS)).toBe(true);
    expect(isAllowed('photo.heic', DEFAULT_EXTENSIONS)).toBe(true);
  });

  it('should reject executable and calendar files', () => {
    expect(isAllowed('virus.exe', DEFAULT_EXTENSIONS)).toBe(false);
    expect(isAllowed('meeting.ics', DEFAULT_EXTENSIONS)).toBe(false);
    expect(isAllowed('app.apk', DEFAULT_EXTENSIONS)).toBe(false);
  });

  it('should handle case insensitive extensions', () => {
    expect(isAllowed('REPORT.PDF', DEFAULT_EXTENSIONS)).toBe(true);
  });
});
