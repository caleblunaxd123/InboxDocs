/**
 * Parser de comprobantes electrónicos peruanos (SUNAT UBL 2.1).
 *
 * Soporta:
 *   - Facturas electrónicas (tipo 01)
 *   - Boletas de venta (tipo 03)
 *   - Notas de crédito (tipo 07)
 *   - Notas de débito (tipo 08)
 *
 * El XML de SUNAT sigue el estándar UBL 2.1 con extensiones propietarias.
 * No usamos DOMParser (no disponible en React Native) — usamos regex sobre
 * el texto del XML para extraer los campos necesarios.
 */

import { SunatInvoice, SunatDocumentType, SunatLineItem } from '../types';
import { v4 as uuidv4 } from 'uuid';

// ─── Helpers de extracción ─────────────────────────────────────────────────────

/**
 * Extrae el contenido textual del primer elemento XML que coincida con el tag.
 * Ignora namespaces (busca `:<tagName>` o `<tagName>`).
 */
function extractTag(xml: string, tagName: string): string {
  // Intenta con namespace primero (cbc:X, cac:X, ext:X, etc.) y sin namespace
  const re = new RegExp(
    `<(?:[a-zA-Z]+:)?${tagName}[^>]*>([^<]*)<\\/(?:[a-zA-Z]+:)?${tagName}>`,
    'i'
  );
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

/**
 * Extrae el contenido del tag con un atributo específico.
 * Útil para `<cbc:TaxAmount currencyID="PEN">1.80</cbc:TaxAmount>`.
 */
function extractTagWithAttr(xml: string, tagName: string, attr: string, attrValue: string): string {
  const re = new RegExp(
    `<(?:[a-zA-Z]+:)?${tagName}[^>]*${attr}="${attrValue}"[^>]*>([^<]*)<\\/(?:[a-zA-Z]+:)?${tagName}>`,
    'i'
  );
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

/**
 * Extrae todas las ocurrencias de un bloque entre `<ns:Tag>...</ns:Tag>`.
 */
function extractAllBlocks(xml: string, tagName: string): string[] {
  const re = new RegExp(
    `<(?:[a-zA-Z]+:)?${tagName}[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z]+:)?${tagName}>`,
    'gi'
  );
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

function parseFloat2(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

// ─── Mapeo de tipo de documento ────────────────────────────────────────────────

function mapDocType(code: string): SunatDocumentType {
  switch (code.trim()) {
    case '01': return 'factura';
    case '03': return 'boleta';
    case '07': return 'nota_credito';
    case '08': return 'nota_debito';
    default:   return 'unknown';
  }
}

// ─── Parser principal ──────────────────────────────────────────────────────────

export interface ParseResult {
  success: boolean;
  invoice?: Omit<SunatInvoice, 'id' | 'documentId' | 'extractedAt'>;
  error?: string;
}

export function parseSunatXml(xml: string): ParseResult {
  try {
    // Detectar tipo de documento por el elemento raíz o por InvoiceTypeCode
    const invoiceTypeCode =
      extractTag(xml, 'InvoiceTypeCode') ||
      extractTag(xml, 'CreditNoteTypeCode') ||
      extractTag(xml, 'DebitNoteTypeCode');

    // Fallback: detectar por elemento raíz
    let sunatDocumentType: SunatDocumentType;
    if (xml.includes('<Invoice ') || xml.includes('<Invoice>')) {
      sunatDocumentType = invoiceTypeCode ? mapDocType(invoiceTypeCode) : 'factura';
    } else if (xml.includes('<CreditNote ') || xml.includes('<CreditNote>')) {
      sunatDocumentType = 'nota_credito';
    } else if (xml.includes('<DebitNote ') || xml.includes('<DebitNote>')) {
      sunatDocumentType = 'nota_debito';
    } else {
      sunatDocumentType = invoiceTypeCode ? mapDocType(invoiceTypeCode) : 'unknown';
    }

    // Número de comprobante: "F001-00001234"
    const idField = extractTag(xml, 'ID');
    const parts = idField.split('-');
    const serie = parts[0] ?? '';
    const correlativo = parts[1] ?? '';

    // Fecha de emisión
    const issueDate = extractTag(xml, 'IssueDate');
    const dueDate = extractTag(xml, 'DueDate') || null;

    // Moneda
    const currency = extractTagWithAttr(xml, 'LegalMonetaryTotal', 'currencyID', 'PEN')
      ? 'PEN'
      : (extractTagWithAttr(xml, 'LegalMonetaryTotal', 'currencyID', 'USD') ? 'USD' : 'PEN');

    // Emisor — dentro de AccountingSupplierParty o similar
    const supplierBlock =
      extractAllBlocks(xml, 'AccountingSupplierParty')[0] ??
      extractAllBlocks(xml, 'SupplierParty')[0] ?? '';

    const issuerRuc =
      extractTag(supplierBlock, 'ID') ||
      extractTag(xml, 'AccountID') || '';

    const issuerName =
      extractTag(supplierBlock, 'RegistrationName') ||
      extractTag(supplierBlock, 'Name') ||
      extractTag(xml, 'RegistrationName') || '';

    const issuerAddress =
      extractTag(supplierBlock, 'StreetName') ||
      extractTag(supplierBlock, 'AddressLine') || null;

    // Receptor — dentro de AccountingCustomerParty
    const customerBlock =
      extractAllBlocks(xml, 'AccountingCustomerParty')[0] ??
      extractAllBlocks(xml, 'BuyerParty')[0] ?? '';

    const receiverRuc = extractTag(customerBlock, 'ID') || null;
    const receiverName =
      extractTag(customerBlock, 'RegistrationName') ||
      extractTag(customerBlock, 'Name') || null;

    // Montos globales — LegalMonetaryTotal
    const monetaryBlock = extractAllBlocks(xml, 'LegalMonetaryTotal')[0] ?? '';
    const subtotal = parseFloat2(
      extractTag(monetaryBlock, 'TaxExclusiveAmount') ||
      extractTag(monetaryBlock, 'LineExtensionAmount') || '0'
    );
    const total = parseFloat2(
      extractTag(monetaryBlock, 'PayableAmount') ||
      extractTag(monetaryBlock, 'TaxInclusiveAmount') || '0'
    );

    // IGV — en TaxTotal
    const taxBlock = extractAllBlocks(xml, 'TaxTotal')[0] ?? '';
    const igv = parseFloat2(extractTag(taxBlock, 'TaxAmount') || '0');

    const otherCharges = parseFloat2(
      extractTag(monetaryBlock, 'ChargeTotalAmount') ||
      extractTag(monetaryBlock, 'AllowanceTotalAmount') || '0'
    );

    // Líneas de detalle — InvoiceLine / CreditNoteLine / DebitNoteLine
    const lineTagNames = ['InvoiceLine', 'CreditNoteLine', 'DebitNoteLine'];
    let rawLines: string[] = [];
    for (const tag of lineTagNames) {
      rawLines = extractAllBlocks(xml, tag);
      if (rawLines.length > 0) break;
    }

    const lineItems: SunatLineItem[] = rawLines.map((lineXml) => {
      const description =
        extractTag(lineXml, 'Description') ||
        extractTag(lineXml, 'Name') || 'Ítem';
      const quantity = parseFloat2(
        extractTag(lineXml, 'InvoicedQuantity') ||
        extractTag(lineXml, 'CreditedQuantity') ||
        extractTag(lineXml, 'DebitedQuantity') || '1'
      );
      const lineExt = parseFloat2(extractTag(lineXml, 'LineExtensionAmount') || '0');
      const lineTax = parseFloat2(extractTag(lineXml, 'TaxAmount') || '0');
      const unitPrice = quantity > 0 ? parseFloat2(lineExt / quantity) : 0;

      return {
        description,
        quantity,
        unitPrice,
        igv: lineTax,
        subtotal: lineExt,
        total: lineExt + lineTax,
      };
    });

    return {
      success: true,
      invoice: {
        sunatDocumentType,
        serie,
        correlativo,
        fullNumber: idField,
        issueDate,
        dueDate,
        issuerRuc,
        issuerName,
        issuerAddress,
        receiverRuc,
        receiverName,
        currency,
        subtotal,
        igv,
        otherCharges,
        total,
        lineItems,
        extractionSource: 'xml',
        rawXml: xml,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Parse error' };
  }
}

// ─── Detección de XML SUNAT ────────────────────────────────────────────────────

/**
 * Devuelve true si el texto parece ser un comprobante electrónico peruano.
 * Útil para decidir si intentar el parseo en el flujo de sync.
 */
export function isSunatXml(text: string): boolean {
  return (
    (text.includes('<Invoice') ||
      text.includes('<CreditNote') ||
      text.includes('<DebitNote')) &&
    (text.includes('sunat') ||
      text.includes('pe:') ||
      text.includes('InvoiceTypeCode') ||
      text.includes('RegistrationName'))
  );
}

// ─── Construye SunatInvoice completo ──────────────────────────────────────────

export function buildSunatInvoice(
  documentId: string,
  parsed: NonNullable<ParseResult['invoice']>
): SunatInvoice {
  return {
    id: uuidv4(),
    documentId,
    extractedAt: Date.now(),
    ...parsed,
  };
}
