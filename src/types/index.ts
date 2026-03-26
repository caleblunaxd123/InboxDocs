export type Provider = 'gmail' | 'outlook';

export type CategoryId =
  | 'invoice'
  | 'receipt'
  | 'statement'
  | 'contract'
  | 'tax'
  | 'insurance'
  | 'medical'
  | 'other';

export interface Account {
  id: string;
  provider: Provider;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  tokenExpiresAt: number;
  lastSyncAt: number | null;
  syncFromDate: string;
  isActive: boolean;
  createdAt: number;
}

export interface Document {
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
  categoryConfidence: number | null;
  senderEmail: string | null;
  senderName: string | null;
  subject: string | null;
  emailDate: number;
  downloadedAt: number;
  isStarred: boolean;
  notes: string | null;
}

export interface SyncLog {
  id: number;
  accountId: string;
  startedAt: number;
  completedAt: number | null;
  status: 'running' | 'completed' | 'failed';
  emailsScanned: number;
  documentsFound: number;
  documentsDownloaded: number;
  errorMessage: string | null;
}

export interface AppSettings {
  sync_time: string;
  sync_frequency: 'daily' | 'every_12h' | 'every_6h' | 'manual';
  sync_on_open: boolean;
  notify_on_new_docs: boolean;
  allowed_extensions: string[];
  openai_api_key: string;
  default_sync_from_days: number;
  theme: 'light' | 'dark' | 'system';
  max_file_size_mb: number;
  ai_categorization_enabled: boolean;
  biometricsEnabled: boolean;
}

export type FilterCategory = CategoryId | 'all';
export type FilterProvider = Provider | 'all';
export type FilterFileType = 'all' | 'pdf' | 'images' | 'word' | 'excel' | 'xml';
export type FilterDateRange = 'all' | '7d' | '30d' | '90d' | 'custom';
export type SortOption = 'date_desc' | 'date_asc' | 'name_asc' | 'size_desc' | 'sender';

// ─── Smart Inbox: Email Preview (metadata only, no download) ──────────────────

export interface AttachmentPreview {
  id: string;            // attachment ID from Gmail/Outlook
  filename: string;
  mimeType: string;
  size: number;          // bytes
  extension: string;     // lowercase
}

export interface EmailPreview {
  id: string;            // message ID
  accountId: string;
  provider: Provider;
  subject: string;
  senderName: string;
  senderEmail: string;
  date: number;          // epoch ms
  snippet: string;       // short preview text
  attachments: AttachmentPreview[];
  isAlreadyDownloaded: boolean;  // true if ALL attachments already in local DB
}

// ─── SUNAT / Peru Invoice Module ──────────────────────────────────────────────

export type SunatDocumentType =
  | 'factura'
  | 'boleta'
  | 'nota_credito'
  | 'nota_debito'
  | 'unknown';

export interface SunatLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  igv: number;
  subtotal: number;
  total: number;
}

export interface SunatInvoice {
  id: string;
  documentId: string;
  sunatDocumentType: SunatDocumentType;
  serie: string;
  correlativo: string;
  fullNumber: string;
  issueDate: string;
  dueDate: string | null;
  issuerRuc: string;
  issuerName: string;
  issuerAddress: string | null;
  receiverRuc: string | null;
  receiverName: string | null;
  currency: string;
  subtotal: number;
  igv: number;
  otherCharges: number;
  total: number;
  lineItems: SunatLineItem[];
  extractedAt: number;
  extractionSource: 'xml' | 'pdf_text' | 'ai';
  rawXml: string | null;
}

export interface DocumentFilters {
  category: FilterCategory;
  provider: FilterProvider;
  fileType: FilterFileType;
  dateRange: FilterDateRange;
  starredOnly: boolean;
  searchQuery: string;
  sortBy: SortOption;
}
