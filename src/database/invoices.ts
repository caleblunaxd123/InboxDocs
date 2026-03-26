// Stub — full SUNAT invoice module not yet built.
// Replace with real DB queries once the invoices table is implemented.

export interface InvoiceMonthlySummary {
  month: string;
  count: number;
  total: number;
}

export interface InvoiceIssuerSummary {
  issuerRuc: string;
  issuerName: string;
  count: number;
  total: number;
}

export async function getInvoiceGlobalStats(): Promise<{
  totalFacturas: number;
  totalBoletas: number;
  totalGastado: number;
  totalIgv: number;
}> {
  return {
    totalFacturas: 0,
    totalBoletas: 0,
    totalGastado: 0,
    totalIgv: 0,
  };
}

export async function getInvoiceMonthlySummary(_months?: number): Promise<InvoiceMonthlySummary[]> {
  return [];
}

export async function getTopIssuers(_limit?: number): Promise<InvoiceIssuerSummary[]> {
  return [];
}
