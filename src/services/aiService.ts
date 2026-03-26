import { CategoryId } from '../types';
import { AppSettings } from '../types';

interface ClassifyInput {
  filename: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  fileExtension: string;
  snippet: string;
}

interface ClassifyResult {
  categoryId: CategoryId;
  confidence: number;
}

// ─── Keyword-based heuristic fallback ─────────────────────────────────────────

const KEYWORD_MAP: { category: CategoryId; keywords: string[] }[] = [
  {
    category: 'invoice',
    keywords: ['invoice', 'factura', 'bill', 'billing', 'payment due', 'pago', 'cobro', 'cargo'],
  },
  {
    category: 'receipt',
    keywords: ['receipt', 'recibo', 'ticket', 'comprobante', 'purchase', 'order', 'pedido', 'confirmación de compra'],
  },
  {
    category: 'statement',
    keywords: ['statement', 'estado de cuenta', 'account summary', 'balance', 'resumen', 'extracto'],
  },
  {
    category: 'contract',
    keywords: ['contract', 'contrato', 'agreement', 'acuerdo', 'terms', 'service agreement', 'nda', 'convenio'],
  },
  {
    category: 'tax',
    keywords: ['tax', 'impuesto', 'fiscal', 'sat', 'cfdi', 'declaración', 'rfc', 'constancia', 'w-2', '1099'],
  },
  {
    category: 'insurance',
    keywords: ['insurance', 'seguro', 'policy', 'póliza', 'coverage', 'cobertura', 'siniestro', 'claim'],
  },
  {
    category: 'medical',
    keywords: ['medical', 'médico', 'doctor', 'prescription', 'receta', 'lab', 'laboratorio', 'hospital', 'clinic', 'health', 'salud'],
  },
];

function keywordFallback(input: ClassifyInput): ClassifyResult {
  const searchText = [
    input.filename,
    input.senderEmail,
    input.senderName,
    input.subject,
    input.snippet,
  ]
    .join(' ')
    .toLowerCase();

  let bestCategory: CategoryId = 'other';
  let bestScore = 0;

  for (const { category, keywords } of KEYWORD_MAP) {
    const score = keywords.filter((kw) => searchText.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return {
    categoryId: bestCategory,
    confidence: bestScore > 0 ? Math.min(0.3 + bestScore * 0.1, 0.8) : 0.1,
  };
}

// ─── OpenAI categorization ────────────────────────────────────────────────────

export async function categorizeDocument(
  input: ClassifyInput,
  settings: AppSettings
): Promise<ClassifyResult> {
  if (!settings.ai_categorization_enabled || !settings.openai_api_key) {
    return keywordFallback(input);
  }

  try {
    const prompt = `You are a document classifier. Based on the following email metadata, classify the attached document into exactly one category.

Email Subject: ${input.subject}
Sender Email: ${input.senderEmail}
Sender Name: ${input.senderName}
Attachment Filename: ${input.filename}
File Extension: ${input.fileExtension}
Email Snippet: ${input.snippet.slice(0, 200)}

Categories (respond with the category ID only):
- invoice: Bills, invoices, payment requests from vendors or services
- receipt: Purchase receipts, payment confirmations, tickets
- statement: Bank statements, credit card statements, account summaries
- contract: Contracts, agreements, terms of service, legal documents
- tax: Tax returns, tax forms, tax certificates
- insurance: Insurance policies, coverage documents, claims
- medical: Medical records, prescriptions, lab results, health documents
- other: Anything that doesn't fit the above

Respond with a JSON object: {"category": "<category_id>", "confidence": <0.0-1.0>}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.openai_api_key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);

    const validCategories: CategoryId[] = [
      'invoice', 'receipt', 'statement', 'contract', 'tax', 'insurance', 'medical', 'other',
    ];
    const category = validCategories.includes(parsed.category) ? parsed.category : 'other';
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;

    // Low confidence → fallback to 'other'
    if (confidence < 0.5) {
      return { categoryId: 'other', confidence };
    }

    return { categoryId: category, confidence };
  } catch (err) {
    console.warn('AI categorization failed, using keyword fallback:', err);
    return keywordFallback(input);
  }
}

export async function testOpenAIConnection(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}
