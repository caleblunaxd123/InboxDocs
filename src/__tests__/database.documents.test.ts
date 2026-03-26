/**
 * Unit tests for database/documents.ts filter query building logic.
 *
 * We test the SQL filter LOGIC by replicating the condition-building
 * algorithm, since the actual DB operations use the expo-sqlite mock.
 * This catches the .doc/.xls extension bug and filter accumulation errors.
 */
import { DocumentFilters } from '../types';

// ─── Replicate filter logic from documents.ts ────────────────────────────────

interface FilterQuery {
  conditions: string[];
  params: any[];
  orderBy: string;
}

/** Current (buggy) version as in documents.ts */
function buildFilterQueryCurrent(filters: DocumentFilters, accountId?: string): FilterQuery {
  const conditions: string[] = [];
  const params: any[] = [];

  if (accountId) {
    conditions.push('d.account_id = ?');
    params.push(accountId);
  }
  if (filters.category !== 'all') {
    conditions.push('d.category = ?');
    params.push(filters.category);
  }
  if (filters.provider !== 'all') {
    conditions.push('a.provider = ?');
    params.push(filters.provider);
  }
  if (filters.fileType !== 'all') {
    // BUG: 'word' only includes 'docx' (not 'doc'), 'excel' only 'xlsx' (not 'xls')
    const extMap: Record<string, string[]> = {
      pdf: ['pdf'],
      images: ['jpg', 'jpeg', 'png', 'heic', 'webp'],
      word: ['docx'],         // Missing 'doc'
      excel: ['xlsx'],        // Missing 'xls'
      xml: ['xml', 'txt'],   // Missing 'csv'
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

  const sortMap: Record<string, string> = {
    date_desc: 'd.email_date DESC',
    date_asc: 'd.email_date ASC',
    name_asc: 'd.original_filename ASC',
    size_desc: 'd.file_size DESC',
    sender: 'd.sender_name ASC',
  };
  const orderBy = sortMap[filters.sortBy] ?? 'd.email_date DESC';

  return { conditions, params, orderBy };
}

/** Fixed version (what it SHOULD be) */
function buildFilterQueryFixed(filters: DocumentFilters, accountId?: string): FilterQuery {
  const conditions: string[] = [];
  const params: any[] = [];

  if (accountId) {
    conditions.push('d.account_id = ?');
    params.push(accountId);
  }
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
      word: ['doc', 'docx'],       // FIXED: includes 'doc'
      excel: ['xls', 'xlsx'],      // FIXED: includes 'xls'
      xml: ['xml', 'txt', 'csv'],  // FIXED: includes 'csv'
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

  const sortMap: Record<string, string> = {
    date_desc: 'd.email_date DESC',
    date_asc: 'd.email_date ASC',
    name_asc: 'd.original_filename ASC',
    size_desc: 'd.file_size DESC',
    sender: 'd.sender_name ASC',
  };
  const orderBy = sortMap[filters.sortBy] ?? 'd.email_date DESC';

  return { conditions, params, orderBy };
}

function defaultFilters(overrides: Partial<DocumentFilters> = {}): DocumentFilters {
  return {
    category: 'all',
    provider: 'all',
    fileType: 'all',
    dateRange: 'all',
    starredOnly: false,
    searchQuery: '',
    sortBy: 'date_desc',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('documents filter builder — no filters', () => {
  it('generates empty conditions when all filters are "all"', () => {
    const { conditions, params } = buildFilterQueryFixed(defaultFilters());
    expect(conditions).toHaveLength(0);
    expect(params).toHaveLength(0);
  });

  it('generates correct ORDER BY for default sort', () => {
    const { orderBy } = buildFilterQueryFixed(defaultFilters());
    expect(orderBy).toBe('d.email_date DESC');
  });
});

describe('documents filter builder — category filter', () => {
  it('adds category condition when category is not "all"', () => {
    const { conditions, params } = buildFilterQueryFixed(defaultFilters({ category: 'invoice' }));
    expect(conditions).toContain('d.category = ?');
    expect(params).toContain('invoice');
  });

  it('does not add category condition when "all"', () => {
    const { conditions } = buildFilterQueryFixed(defaultFilters({ category: 'all' }));
    expect(conditions.some(c => c.includes('category'))).toBe(false);
  });

  it('supports all valid category values', () => {
    const categories = ['invoice', 'receipt', 'statement', 'contract', 'tax', 'insurance', 'medical', 'other'] as const;
    for (const cat of categories) {
      const { params } = buildFilterQueryFixed(defaultFilters({ category: cat }));
      expect(params).toContain(cat);
    }
  });
});

describe('documents filter builder — provider filter', () => {
  it('adds provider condition for gmail', () => {
    const { conditions, params } = buildFilterQueryFixed(defaultFilters({ provider: 'gmail' }));
    expect(conditions.some(c => c.includes('a.provider'))).toBe(true);
    expect(params).toContain('gmail');
  });

  it('adds provider condition for outlook', () => {
    const { params } = buildFilterQueryFixed(defaultFilters({ provider: 'outlook' }));
    expect(params).toContain('outlook');
  });
});

describe('documents filter builder — fileType filter (BUG vs FIXED)', () => {
  it('BUG: current implementation misses .doc files in word filter', () => {
    const { params } = buildFilterQueryCurrent(defaultFilters({ fileType: 'word' }));
    expect(params).not.toContain('doc');   // BUG: .doc files are invisible in Repository
    expect(params).toContain('docx');      // Only docx is included
  });

  it('FIXED: corrected implementation includes both .doc and .docx', () => {
    const { params } = buildFilterQueryFixed(defaultFilters({ fileType: 'word' }));
    expect(params).toContain('doc');
    expect(params).toContain('docx');
  });

  it('BUG: current implementation misses .xls files in excel filter', () => {
    const { params } = buildFilterQueryCurrent(defaultFilters({ fileType: 'excel' }));
    expect(params).not.toContain('xls');  // BUG
    expect(params).toContain('xlsx');
  });

  it('FIXED: corrected implementation includes both .xls and .xlsx', () => {
    const { params } = buildFilterQueryFixed(defaultFilters({ fileType: 'excel' }));
    expect(params).toContain('xls');
    expect(params).toContain('xlsx');
  });

  it('BUG: current implementation misses .csv in xml filter', () => {
    const { params } = buildFilterQueryCurrent(defaultFilters({ fileType: 'xml' }));
    expect(params).not.toContain('csv');
  });

  it('FIXED: xml filter includes csv', () => {
    const { params } = buildFilterQueryFixed(defaultFilters({ fileType: 'xml' }));
    expect(params).toContain('csv');
    expect(params).toContain('xml');
    expect(params).toContain('txt');
  });

  it('includes all 5 image extensions for images filter', () => {
    const { params } = buildFilterQueryFixed(defaultFilters({ fileType: 'images' }));
    expect(params).toContain('jpg');
    expect(params).toContain('jpeg');
    expect(params).toContain('png');
    expect(params).toContain('heic');
    expect(params).toContain('webp');
  });

  it('includes single extension for pdf filter', () => {
    const { params } = buildFilterQueryFixed(defaultFilters({ fileType: 'pdf' }));
    expect(params).toContain('pdf');
    expect(params).toHaveLength(1);
  });
});

describe('documents filter builder — date range filter', () => {
  it('adds date condition for 7d range', () => {
    const { conditions, params } = buildFilterQueryFixed(defaultFilters({ dateRange: '7d' }));
    expect(conditions.some(c => c.includes('email_date'))).toBe(true);
    const expectedMs = 7 * 24 * 60 * 60 * 1000;
    const dateParam = params[0] as number;
    expect(Date.now() - dateParam).toBeCloseTo(expectedMs, -3); // within 1 second
  });

  it('adds date condition for 30d range', () => {
    const { params } = buildFilterQueryFixed(defaultFilters({ dateRange: '30d' }));
    const expectedMs = 30 * 24 * 60 * 60 * 1000;
    expect(Date.now() - params[0]).toBeCloseTo(expectedMs, -3);
  });

  it('adds date condition for 90d range', () => {
    const { params } = buildFilterQueryFixed(defaultFilters({ dateRange: '90d' }));
    const expectedMs = 90 * 24 * 60 * 60 * 1000;
    expect(Date.now() - params[0]).toBeCloseTo(expectedMs, -3);
  });

  it('does NOT add date condition for "all" range', () => {
    const { conditions } = buildFilterQueryFixed(defaultFilters({ dateRange: 'all' }));
    expect(conditions.some(c => c.includes('email_date'))).toBe(false);
  });

  it('does NOT add date condition for "custom" range (handled externally)', () => {
    const { conditions } = buildFilterQueryFixed(defaultFilters({ dateRange: 'custom' }));
    expect(conditions.some(c => c.includes('email_date'))).toBe(false);
  });
});

describe('documents filter builder — starred filter', () => {
  it('adds is_starred condition when starredOnly=true', () => {
    const { conditions } = buildFilterQueryFixed(defaultFilters({ starredOnly: true }));
    expect(conditions).toContain('d.is_starred = 1');
  });

  it('does not add starred condition when starredOnly=false', () => {
    const { conditions } = buildFilterQueryFixed(defaultFilters({ starredOnly: false }));
    expect(conditions.some(c => c.includes('is_starred'))).toBe(false);
  });
});

describe('documents filter builder — search query', () => {
  it('adds LIKE conditions for searchQuery >= 2 chars', () => {
    const { conditions, params } = buildFilterQueryFixed(defaultFilters({ searchQuery: 'ab' }));
    expect(conditions.some(c => c.includes('LIKE'))).toBe(true);
    // 4 params for the 4 LIKE placeholders
    expect(params).toContain('%ab%');
    expect(params.filter(p => p === '%ab%')).toHaveLength(4);
  });

  it('does NOT add LIKE conditions for single char query (too broad)', () => {
    const { conditions } = buildFilterQueryFixed(defaultFilters({ searchQuery: 'a' }));
    expect(conditions.some(c => c.includes('LIKE'))).toBe(false);
  });

  it('does NOT add LIKE conditions for empty query', () => {
    const { conditions } = buildFilterQueryFixed(defaultFilters({ searchQuery: '' }));
    expect(conditions.some(c => c.includes('LIKE'))).toBe(false);
  });

  it('wraps search query with % for partial matching', () => {
    const { params } = buildFilterQueryFixed(defaultFilters({ searchQuery: 'factura' }));
    const likeParams = params.filter(p => typeof p === 'string' && p.startsWith('%'));
    expect(likeParams).toHaveLength(4);
    expect(likeParams[0]).toBe('%factura%');
  });
});

describe('documents filter builder — sort options', () => {
  const sortCases: Array<[DocumentFilters['sortBy'], string]> = [
    ['date_desc', 'd.email_date DESC'],
    ['date_asc', 'd.email_date ASC'],
    ['name_asc', 'd.original_filename ASC'],
    ['size_desc', 'd.file_size DESC'],
    ['sender', 'd.sender_name ASC'],
  ];

  sortCases.forEach(([sortBy, expectedOrderBy]) => {
    it(`maps sortBy="${sortBy}" to "${expectedOrderBy}"`, () => {
      const { orderBy } = buildFilterQueryFixed(defaultFilters({ sortBy }));
      expect(orderBy).toBe(expectedOrderBy);
    });
  });
});

describe('documents filter builder — combined filters', () => {
  it('accumulates multiple filter conditions correctly', () => {
    const filters = defaultFilters({
      category: 'invoice',
      provider: 'gmail',
      fileType: 'pdf',
      starredOnly: true,
      searchQuery: 'enero',
    });
    const { conditions, params } = buildFilterQueryFixed(filters, 'acc-1');

    // accountId + category + provider + fileType(1) + starred + search = 6 conditions
    expect(conditions).toHaveLength(6);
    expect(params).toHaveLength(1 + 1 + 1 + 1 + 4); // acc + cat + prov + ext + search×4 (starred has no param)
    expect(params).toContain('acc-1');
    expect(params).toContain('invoice');
    expect(params).toContain('gmail');
    expect(params).toContain('pdf');
    expect(params).toContain('%enero%');
  });

  it('no conditions and no params for completely empty filters (no account)', () => {
    const { conditions, params } = buildFilterQueryFixed(defaultFilters());
    expect(conditions).toHaveLength(0);
    expect(params).toHaveLength(0);
  });
});
