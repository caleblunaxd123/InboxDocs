/**
 * Unit tests for the AI categorization service.
 *
 * Tests the keyword-based heuristic (keywordFallback) and the
 * categorizeDocument orchestration without making real OpenAI API calls.
 *
 * Strategy: categorizeDocument is called with ai_categorization_enabled=false
 * to force the keyword path, keeping tests fast and deterministic.
 */
import { categorizeDocument } from '../services/aiService';
import { AppSettings } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function baseSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    sync_time: '07:00',
    sync_frequency: 'daily',
    sync_on_open: true,
    notify_on_new_docs: true,
    allowed_extensions: ['pdf', 'docx', 'xlsx'],
    openai_api_key: '',
    default_sync_from_days: 30,
    theme: 'system',
    max_file_size_mb: 25,
    ai_categorization_enabled: false,  // force keyword fallback
    biometricsEnabled: false,
    ...overrides,
  };
}

function input(overrides: Record<string, string> = {}) {
  return {
    filename: 'document.pdf',
    senderEmail: 'sender@example.com',
    senderName: 'Example Sender',
    subject: '',
    fileExtension: 'pdf',
    snippet: '',
    ...overrides,
  };
}

const noAI = baseSettings();

// ─── Keyword fallback — category detection ───────────────────────────────────

describe('aiService — keyword fallback categorization', () => {
  it('categorizes invoice by filename keyword', async () => {
    const result = await categorizeDocument(input({ filename: 'factura_enero.pdf' }), noAI);
    expect(result.categoryId).toBe('invoice');
    expect(result.confidence).toBeGreaterThan(0.1);
  });

  it('categorizes invoice by subject keyword (English)', async () => {
    const result = await categorizeDocument(input({ subject: 'Your invoice for January services' }), noAI);
    expect(result.categoryId).toBe('invoice');
  });

  it('categorizes invoice by subject keyword (Spanish)', async () => {
    const result = await categorizeDocument(input({ subject: 'Cobro mensual suscripción' }), noAI);
    expect(result.categoryId).toBe('invoice');
  });

  it('categorizes receipt by filename keyword', async () => {
    const result = await categorizeDocument(input({ filename: 'receipt_amazon.pdf' }), noAI);
    expect(result.categoryId).toBe('receipt');
  });

  it('categorizes receipt by snippet keyword', async () => {
    const result = await categorizeDocument(input({ snippet: 'Gracias por tu compra. Aquí está tu comprobante.' }), noAI);
    expect(result.categoryId).toBe('receipt');
  });

  it('categorizes bank statement by subject', async () => {
    const result = await categorizeDocument(input({ subject: 'Tu estado de cuenta de octubre' }), noAI);
    expect(result.categoryId).toBe('statement');
  });

  it('categorizes bank statement by English keyword', async () => {
    const result = await categorizeDocument(input({ subject: 'Your monthly account summary' }), noAI);
    expect(result.categoryId).toBe('statement');
  });

  it('categorizes contract by filename', async () => {
    const result = await categorizeDocument(input({ filename: 'contrato_servicios.docx' }), noAI);
    expect(result.categoryId).toBe('contract');
  });

  it('categorizes contract by subject (NDA)', async () => {
    const result = await categorizeDocument(input({ subject: 'NDA for project review' }), noAI);
    expect(result.categoryId).toBe('contract');
  });

  it('categorizes tax document by SAT keyword', async () => {
    const result = await categorizeDocument(input({ subject: 'CFDI emitido por SAT' }), noAI);
    expect(result.categoryId).toBe('tax');
  });

  it('categorizes tax document by English keyword', async () => {
    const result = await categorizeDocument(input({ filename: 'w-2_2024.pdf' }), noAI);
    expect(result.categoryId).toBe('tax');
  });

  it('categorizes insurance by sender name', async () => {
    const result = await categorizeDocument(input({ senderName: 'MAPFRE Seguros' }), noAI);
    expect(result.categoryId).toBe('insurance');
  });

  it('categorizes insurance by policy keyword', async () => {
    const result = await categorizeDocument(input({ subject: 'Tu póliza de auto renovada' }), noAI);
    expect(result.categoryId).toBe('insurance');
  });

  it('categorizes medical by filename', async () => {
    const result = await categorizeDocument(input({ filename: 'receta_medica.pdf' }), noAI);
    expect(result.categoryId).toBe('medical');
  });

  it('categorizes medical by lab keyword', async () => {
    const result = await categorizeDocument(input({ subject: 'Resultados de laboratorio' }), noAI);
    expect(result.categoryId).toBe('medical');
  });

  it('returns "other" for unrecognized content', async () => {
    const result = await categorizeDocument(
      input({ filename: 'random.pdf', subject: '', snippet: '', senderName: '', senderEmail: '' }),
      noAI
    );
    expect(result.categoryId).toBe('other');
  });

  it('returns low confidence for "other" category', async () => {
    const result = await categorizeDocument(
      input({ filename: 'xyz.pdf', subject: '', snippet: '' }),
      noAI
    );
    expect(result.confidence).toBeLessThanOrEqual(0.15);
  });

  it('returns higher confidence for multiple keyword matches', async () => {
    const oneMatch = await categorizeDocument(input({ filename: 'factura.pdf' }), noAI);
    const twoMatches = await categorizeDocument(
      input({ filename: 'factura.pdf', subject: 'Tu factura de enero, pago pendiente' }),
      noAI
    );
    expect(twoMatches.confidence).toBeGreaterThanOrEqual(oneMatch.confidence);
  });

  it('caps confidence at 0.8 maximum', async () => {
    // Many keywords to max out scoring
    const result = await categorizeDocument(
      input({
        filename: 'factura_invoice.pdf',
        subject: 'factura billing cobro pago payment',
        snippet: 'cargo bill invoice factura pago cobro',
        senderName: 'factura',
      }),
      noAI
    );
    expect(result.confidence).toBeLessThanOrEqual(0.8);
  });

  it('picks best category when multiple categories match', async () => {
    // 'invoice' keywords > 'receipt' keywords → should be invoice
    const result = await categorizeDocument(
      input({
        filename: 'factura.pdf',
        subject: 'factura cobro pago invoice billing payment',  // 6 invoice keywords
        snippet: 'recibo',                                      // 1 receipt keyword
      }),
      noAI
    );
    expect(result.categoryId).toBe('invoice');
  });
});

// ─── Settings gate ────────────────────────────────────────────────────────────

describe('aiService — AI disabled gate', () => {
  it('uses keyword fallback when ai_categorization_enabled is false', async () => {
    const settings = baseSettings({ ai_categorization_enabled: false, openai_api_key: 'sk-fake' });
    const result = await categorizeDocument(input({ filename: 'factura.pdf' }), settings);
    // No HTTP call made (no fetch mock needed) — keyword fallback handles it
    expect(result.categoryId).toBe('invoice');
  });

  it('uses keyword fallback when openai_api_key is empty string', async () => {
    const settings = baseSettings({ ai_categorization_enabled: true, openai_api_key: '' });
    const result = await categorizeDocument(input({ filename: 'factura.pdf' }), settings);
    expect(result.categoryId).toBe('invoice');
  });

  it('returns a valid CategoryId type always', async () => {
    const validCategories = ['invoice', 'receipt', 'statement', 'contract', 'tax', 'insurance', 'medical', 'other'];
    const result = await categorizeDocument(input({ filename: 'unknown_xyz_123.pdf' }), noAI);
    expect(validCategories).toContain(result.categoryId);
  });

  it('confidence is always a number between 0.1 and 0.8', async () => {
    const cases = [
      input({ filename: 'factura.pdf' }),
      input({ filename: 'recibo.pdf' }),
      input({ filename: 'random.pdf' }),
      input({ subject: 'tax return 2024' }),
      input({ senderName: 'hospital general' }),
    ];
    for (const c of cases) {
      const result = await categorizeDocument(c, noAI);
      expect(result.confidence).toBeGreaterThanOrEqual(0.1);
      expect(result.confidence).toBeLessThanOrEqual(0.8);
    }
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────

describe('aiService — edge cases', () => {
  it('handles empty input gracefully', async () => {
    const result = await categorizeDocument(
      { filename: '', senderEmail: '', senderName: '', subject: '', fileExtension: '', snippet: '' },
      noAI
    );
    expect(result.categoryId).toBe('other');
    expect(result.confidence).toBe(0.1);
  });

  it('is case-insensitive in keyword matching', async () => {
    const lowerResult = await categorizeDocument(input({ subject: 'invoice payment' }), noAI);
    const upperResult = await categorizeDocument(input({ subject: 'INVOICE PAYMENT' }), noAI);
    expect(lowerResult.categoryId).toBe(upperResult.categoryId);
    expect(lowerResult.confidence).toBe(upperResult.confidence);
  });

  it('matches keywords in snippet (first 200 chars context)', async () => {
    const result = await categorizeDocument(
      input({ snippet: 'Your insurance policy renewal is due next month. Coverage details inside.' }),
      noAI
    );
    expect(result.categoryId).toBe('insurance');
  });

  it('handles very long snippet without errors', async () => {
    const longSnippet = 'factura '.repeat(500); // 4000 chars
    const result = await categorizeDocument(input({ snippet: longSnippet }), noAI);
    expect(result.categoryId).toBe('invoice');
  });

  it('handles special characters in filename', async () => {
    const result = await categorizeDocument(
      input({ filename: 'Factura #123 (enero-2024).pdf' }),
      noAI
    );
    // Should match 'factura' in filename
    expect(result.categoryId).toBe('invoice');
  });
});
