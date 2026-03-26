import { getDatabase } from './schema';
import { SunatInvoice, SunatLineItem, SunatDocumentType } from '../types';

function rowToInvoice(row: any): SunatInvoice {
  return {
    id: row.id,
    documentId: row.document_id,
    sunatDocumentType: row.sunat_document_type as SunatDocumentType,
    serie: row.serie,
    correlativo: row.correlativo,
    fullNumber: row.full_number,
    issueDate: row.issue_date,
    dueDate: row.due_date ?? null,
    issuerRuc: row.issuer_ruc,
    issuerName: row.issuer_name,
    issuerAddress: row.issuer_address ?? null,
    receiverRuc: row.receiver_ruc ?? null,
    receiverName: row.receiver_name ?? null,
    currency: row.currency,
    subtotal: row.subtotal,
    igv: row.igv,
    otherCharges: row.other_charges,
    total: row.total,
    lineItems: JSON.parse(row.line_items ?? '[]') as SunatLineItem[],
    extractedAt: row.extracted_at,
    extractionSource: row.extraction_source as SunatInvoice['extractionSource'],
    rawXml: row.raw_xml ?? null,
  };
}

export async function upsertSunatInvoice(invoice: SunatInvoice): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO sunat_invoices (
       id, document_id, sunat_document_type, serie, correlativo, full_number,
       issue_date, due_date, issuer_ruc, issuer_name, issuer_address,
       receiver_ruc, receiver_name, currency, subtotal, igv, other_charges, total,
       line_items, extracted_at, extraction_source, raw_xml
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(document_id) DO UPDATE SET
       sunat_document_type = excluded.sunat_document_type,
       serie = excluded.serie,
       correlativo = excluded.correlativo,
       full_number = excluded.full_number,
       issue_date = excluded.issue_date,
       due_date = excluded.due_date,
       issuer_ruc = excluded.issuer_ruc,
       issuer_name = excluded.issuer_name,
       issuer_address = excluded.issuer_address,
       receiver_ruc = excluded.receiver_ruc,
       receiver_name = excluded.receiver_name,
       currency = excluded.currency,
       subtotal = excluded.subtotal,
       igv = excluded.igv,
       other_charges = excluded.other_charges,
       total = excluded.total,
       line_items = excluded.line_items,
       extracted_at = excluded.extracted_at,
       extraction_source = excluded.extraction_source,
       raw_xml = excluded.raw_xml`,
    [
      invoice.id,
      invoice.documentId,
      invoice.sunatDocumentType,
      invoice.serie,
      invoice.correlativo,
      invoice.fullNumber,
      invoice.issueDate,
      invoice.dueDate,
      invoice.issuerRuc,
      invoice.issuerName,
      invoice.issuerAddress,
      invoice.receiverRuc,
      invoice.receiverName,
      invoice.currency,
      invoice.subtotal,
      invoice.igv,
      invoice.otherCharges,
      invoice.total,
      JSON.stringify(invoice.lineItems),
      invoice.extractedAt,
      invoice.extractionSource,
      invoice.rawXml,
    ]
  );
}

export async function getSunatInvoiceByDocumentId(documentId: string): Promise<SunatInvoice | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync(
    'SELECT * FROM sunat_invoices WHERE document_id = ?',
    [documentId]
  );
  return row ? rowToInvoice(row) : null;
}

export async function getSunatInvoiceById(id: string): Promise<SunatInvoice | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync('SELECT * FROM sunat_invoices WHERE id = ?', [id]);
  return row ? rowToInvoice(row) : null;
}

export async function deleteSunatInvoice(documentId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM sunat_invoices WHERE document_id = ?', [documentId]);
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface InvoiceMonthlySummary {
  month: string;   // "YYYY-MM"
  total: number;
  igv: number;
  subtotal: number;
  count: number;
}

export interface InvoiceIssuerSummary {
  issuerRuc: string;
  issuerName: string;
  count: number;
  total: number;
  igv: number;
}

/** Totales mensuales de los últimos N meses. */
export async function getInvoiceMonthlySummary(months = 12): Promise<InvoiceMonthlySummary[]> {
  const db = await getDatabase();
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);
  const sinceIso = since.toISOString().slice(0, 10); // "YYYY-MM-DD"

  const rows = await db.getAllAsync(
    `SELECT
       substr(issue_date, 1, 7) as month,
       COUNT(*) as count,
       ROUND(SUM(subtotal), 2) as subtotal,
       ROUND(SUM(igv), 2) as igv,
       ROUND(SUM(total), 2) as total
     FROM sunat_invoices
     WHERE issue_date >= ?
       AND sunat_document_type IN ('factura', 'boleta')
     GROUP BY month
     ORDER BY month ASC`,
    [sinceIso]
  );

  return (rows as any[]).map((r) => ({
    month: r.month,
    count: r.count,
    subtotal: r.subtotal,
    igv: r.igv,
    total: r.total,
  }));
}

/** Top emisores/proveedores por monto total. */
export async function getTopIssuers(limit = 8): Promise<InvoiceIssuerSummary[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT
       issuer_ruc,
       issuer_name,
       COUNT(*) as count,
       ROUND(SUM(total), 2) as total,
       ROUND(SUM(igv), 2) as igv
     FROM sunat_invoices
     WHERE sunat_document_type IN ('factura', 'boleta')
     GROUP BY issuer_ruc
     ORDER BY total DESC
     LIMIT ?`,
    [limit]
  );

  return (rows as any[]).map((r) => ({
    issuerRuc: r.issuer_ruc,
    issuerName: r.issuer_name,
    count: r.count,
    total: r.total,
    igv: r.igv,
  }));
}

/** Resumen global: total gastado, IGV pagado, número de facturas. */
export async function getInvoiceGlobalStats(): Promise<{
  totalFacturas: number;
  totalBoletas: number;
  totalGastado: number;
  totalIgv: number;
}> {
  const db = await getDatabase();
  const row: any = await db.getFirstAsync(
    `SELECT
       COUNT(CASE WHEN sunat_document_type = 'factura' THEN 1 END) as total_facturas,
       COUNT(CASE WHEN sunat_document_type = 'boleta' THEN 1 END) as total_boletas,
       ROUND(COALESCE(SUM(total), 0), 2) as total_gastado,
       ROUND(COALESCE(SUM(igv), 0), 2) as total_igv
     FROM sunat_invoices
     WHERE sunat_document_type IN ('factura', 'boleta')`
  );
  return {
    totalFacturas: row?.total_facturas ?? 0,
    totalBoletas: row?.total_boletas ?? 0,
    totalGastado: row?.total_gastado ?? 0,
    totalIgv: row?.total_igv ?? 0,
  };
}
