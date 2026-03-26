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

// ─── SUNAT / Peru Invoice Module ──────────────────────────────────────────────

/** Tipo de comprobante de pago electrónico peruano */
export type SunatDocumentType =
  | 'factura'      // Factura electrónica (01)
  | 'boleta'       // Boleta de venta electrónica (03)
  | 'nota_credito' // Nota de crédito (07)
  | 'nota_debito'  // Nota de débito (08)
  | 'unknown';

export interface SunatLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  igv: number;      // IGV (18%) en soles
  subtotal: number; // sin IGV
  total: number;    // con IGV
}

/**
 * Datos extraídos de un comprobante electrónico peruano (XML o PDF).
 * Relacionado 1:1 con un Document a través de documentId.
 */
export interface SunatInvoice {
  id: string;
  documentId: string;        // FK → Document.id

  // Identificación del comprobante
  sunatDocumentType: SunatDocumentType;
  serie: string;             // e.g. "F001"
  correlativo: string;       // e.g. "00001234"
  fullNumber: string;        // e.g. "F001-00001234"
  issueDate: string;         // ISO date "2024-01-15"
  dueDate: string | null;    // fecha vencimiento (opcional)

  // Emisor
  issuerRuc: string;
  issuerName: string;
  issuerAddress: string | null;

  // Receptor
  receiverRuc: string | null;
  receiverName: string | null;

  // Montos
  currency: string;          // "PEN" | "USD"
  subtotal: number;          // Base imponible (sin IGV)
  igv: number;               // IGV 18%
  otherCharges: number;      // Otros cargos/descuentos
  total: number;             // Total a pagar

  // Líneas de detalle (puede ser vacío si no se pudo parsear)
  lineItems: SunatLineItem[];

  // Metadatos de extracción
  extractedAt: number;       // timestamp
  extractionSource: 'xml' | 'pdf_text' | 'ai';
  rawXml: string | null;     // XML original (solo para comprobantes XML)
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
