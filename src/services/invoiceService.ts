// Stub — full SUNAT invoice module not yet built.
// Replace with real lookup logic once invoice parsing is implemented.

import { SunatInvoice } from '../types';

export async function getInvoiceForDocument(documentId: string): Promise<SunatInvoice | null> {
  return null;
}

export async function extractAndPersistInvoice(
  _document: any,
): Promise<void> {
  // Stub — will extract SUNAT data from XML/PDF when module is complete
}
