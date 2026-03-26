import { create } from 'zustand';
import { Account, Document, AppSettings, DocumentFilters, CategoryId } from '../types';

interface SyncStateEntry {
  isSyncing: boolean;
  progress: string;
  lastSyncAt: number | null;
  emailsScanned: number;
  documentsFound: number;
  documentsDownloaded: number;
}

interface SyncState {
  [accountId: string]: SyncStateEntry;
}

interface AppStore {
  // Auth
  accounts: Account[];
  isInitialized: boolean;
  hasSeenWalkthrough: boolean;
  setAccounts: (accounts: Account[]) => void;
  addAccount: (account: Account) => void;
  removeAccount: (id: string) => void;
  updateAccount: (id: string, updates: Partial<Account>) => void;
  setInitialized: (value: boolean) => void;
  setHasSeenWalkthrough: (value: boolean) => void;

  // Active account filter (null = show all accounts)
  activeAccountId: string | null;
  setActiveAccountId: (id: string | null) => void;
  getActiveAccount: () => Account | null;

  // Documents
  documents: Document[];
  recentDocuments: Document[];
  starredDocuments: Document[];
  setDocuments: (docs: Document[]) => void;
  setRecentDocuments: (docs: Document[]) => void;
  setStarredDocuments: (docs: Document[]) => void;
  updateDocument: (id: string, updates: Partial<Document>) => void;
  removeDocument: (id: string) => void;
  upsertDocument: (doc: Document) => void;

  // Stats
  totalDocuments: number;
  totalSizeBytes: number;
  setStats: (total: number, size: number) => void;

  // Filters
  filters: DocumentFilters;
  setFilter: <K extends keyof DocumentFilters>(key: K, value: DocumentFilters[K]) => void;
  resetFilters: () => void;

  // Sync
  syncState: SyncState;
  setSyncState: (accountId: string, state: Partial<SyncStateEntry>) => void;

  // Settings
  settings: AppSettings | null;
  setSettings: (settings: AppSettings) => void;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const defaultFilters: DocumentFilters = {
  category: 'all',
  provider: 'all',
  fileType: 'all',
  dateRange: 'all',
  starredOnly: false,
  searchQuery: '',
  sortBy: 'date_desc',
};

export const useAppStore = create<AppStore>((set, get) => ({
  // Auth
  accounts: [],
  isInitialized: false,
  hasSeenWalkthrough: false,
  setAccounts: (accounts) => set({ accounts }),
  addAccount: (account) => set((s) => ({ accounts: [...s.accounts, account] })),
  removeAccount: (id) => set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) })),
  updateAccount: (id, updates) =>
    set((s) => ({
      accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),
  setInitialized: (value) => set({ isInitialized: value }),
  setHasSeenWalkthrough: (value) => set({ hasSeenWalkthrough: value }),

  // Active account filter
  activeAccountId: null,
  setActiveAccountId: (id) => set({ activeAccountId: id }),
  getActiveAccount: () => {
    const state = get();
    if (!state.activeAccountId) return null;
    return state.accounts.find((a) => a.id === state.activeAccountId) ?? null;
  },

  // Documents
  documents: [],
  recentDocuments: [],
  starredDocuments: [],
  setDocuments: (documents) => set({ documents }),
  setRecentDocuments: (recentDocuments) => set({ recentDocuments }),
  setStarredDocuments: (starredDocuments) => set({ starredDocuments }),
  updateDocument: (id, updates) =>
    set((s) => ({
      documents: s.documents.map((d) => (d.id === id ? { ...d, ...updates } : d)),
      recentDocuments: s.recentDocuments.map((d) => (d.id === id ? { ...d, ...updates } : d)),
      starredDocuments: s.starredDocuments
        .map((d) => (d.id === id ? { ...d, ...updates } : d))
        .filter((d) => d.isStarred),
    })),
  removeDocument: (id) =>
    set((s) => {
      const removed = s.documents.find((d) => d.id === id)
        ?? s.recentDocuments.find((d) => d.id === id)
        ?? s.starredDocuments.find((d) => d.id === id);
      return {
        documents: s.documents.filter((d) => d.id !== id),
        recentDocuments: s.recentDocuments.filter((d) => d.id !== id),
        starredDocuments: s.starredDocuments.filter((d) => d.id !== id),
        totalDocuments: Math.max(0, s.totalDocuments - 1),
        // Decrement size only when we know how big the file was
        totalSizeBytes: removed
          ? Math.max(0, s.totalSizeBytes - removed.fileSize)
          : s.totalSizeBytes,
      };
    }),
  upsertDocument: (doc) =>
    set((s) => {
      const existsInDocs = s.documents.some((d) => d.id === doc.id);
      const existsInRecent = s.recentDocuments.some((d) => d.id === doc.id);
      const existsInStarred = s.starredDocuments.some((d) => d.id === doc.id);

      const newDocuments = existsInDocs
        ? s.documents.map((d) => (d.id === doc.id ? doc : d))
        : [doc, ...s.documents];

      // Prepend to recent if new, update if existing
      let newRecent = existsInRecent
        ? s.recentDocuments.map((d) => (d.id === doc.id ? doc : d))
        : [doc, ...s.recentDocuments].slice(0, 20);

      // Update starred: add if starred, remove if not, update if existing
      let newStarred = existsInStarred
        ? s.starredDocuments.map((d) => (d.id === doc.id ? doc : d)).filter((d) => d.isStarred)
        : doc.isStarred ? [doc, ...s.starredDocuments] : s.starredDocuments;

      return {
        documents: newDocuments,
        recentDocuments: newRecent,
        starredDocuments: newStarred,
        // Increment stats only for genuinely new documents
        totalDocuments: existsInDocs ? s.totalDocuments : s.totalDocuments + 1,
        totalSizeBytes: existsInDocs ? s.totalSizeBytes : s.totalSizeBytes + doc.fileSize,
      };
    }),

  // Stats
  totalDocuments: 0,
  totalSizeBytes: 0,
  setStats: (totalDocuments, totalSizeBytes) => set({ totalDocuments, totalSizeBytes }),

  // Filters
  filters: defaultFilters,
  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters: () => set({ filters: defaultFilters }),

  // Sync
  syncState: {},
  setSyncState: (accountId, state) =>
    set((s) => ({
      syncState: {
        ...s.syncState,
        [accountId]: { ...s.syncState[accountId], ...state },
      },
    })),

  // Settings
  settings: null,
  setSettings: (settings) => set({ settings }),
  updateSetting: (key, value) =>
    set((s) => ({
      settings: s.settings ? { ...s.settings, [key]: value } : null,
    })),
}));
