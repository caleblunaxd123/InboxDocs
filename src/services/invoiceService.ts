/**
 * InvoiceService — orquesta la extracción de comprobantes electrónicos peruanos.
 *
 * Flujo:
 *   1. Recibe un Document con fileExtension = 'xml'
 *   2. Lee el archivo del sistema de archivos
 *   3. Valida que sea un XML SUNAT (isSunatXml)
 *   4. Parsea con parseSunatXml
 *   5. Persiste en sunat_invoices vía upsertSunatInvoice
 *
 * Para PDFs de facturas: no tenemos OCR en el cliente, así que por ahora
 * devolvemos null y lo dejamos para una versión futura con Vision API.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Document } from '../types';
import { SunatInvoice } from '../types';
import { parseSunatXml, isSunatXml, buildSunatInvoice } from './sunatParser';
import { upsertSunatInvoice, getSunatInvoiceByDocumentId } from '../database/invoices';

export interface ExtractionResult {
  success: boolean;
  invoice: SunatInvoice | null;
  reason?: string;
}

/**
 * Intenta extraer datos de factura SUNAT del documento.
 * Retorna null en `invoice` si el documento no es un comprobante electrónico.
 */
export async function extractAndPersistInvoice(
  document: Document
): Promise<ExtractionResult> {
  // Solo procesamos XML por ahora
  if (document.fileExtension !== 'xml') {
    return { success: true, invoice: null, reason: 'not_xml' };
  }

  try {
    // Verificar que el archivo existe
    const info = await FileSystem.getInfoAsync(document.filePath);
    if (!info.exists) {
      return { success: false, invoice: null, reason: 'file_not_found' };
    }

    // Leer el XML
    const xml = await FileSystem.readAsStringAsync(document.filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // Verificar que es XML SUNAT
    if (!isSunatXml(xml)) {
      return { success: true, invoice: null, reason: 'not_sunat_xml' };
    }

    // Parsear
    const result = parseSunatXml(xml);
    if (!result.success || !result.invoice) {
      return { success: false, invoice: null, reason: result.error ?? 'parse_failed' };
    }

    // Construir y persistir
    const invoice = buildSunatInvoice(document.id, result.invoice);
    await upsertSunatInvoice(invoice);

    return { success: true, invoice };
  } catch (err: any) {
    console.warn('[InvoiceService] Error extracting invoice:', err);
    return { success: false, invoice: null, reason: err?.message ?? 'unknown_error' };
  }
}

/**
 * Carga la factura SUNAT asociada a un documento (si existe).
 * Útil para mostrar el botón "Ver factura" en DocumentDetailScreen.
 */
export async function getInvoiceForDocument(
  documentId: string
): Promise<SunatInvoice | null> {
  try {
    return await getSunatInvoiceByDocumentId(documentId);
  } catch {
    return null;
  }
}

/**
 * Re-extrae la factura de un documento (útil tras actualizar el parser).
 */
export async function reExtractInvoice(document: Document): Promise<ExtractionResult> {
  return extractAndPersistInvoice(document);
}
