/**
 * Unit tests for format utility functions.
 * These are pure functions — no mocks needed.
 */
import { formatBytes, formatNumber, truncate } from '../utils/format';

describe('formatBytes', () => {
  it('returns "0 B" for 0', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('returns "0 B" for falsy values', () => {
    expect(formatBytes(NaN)).toBe('0 B');
  });

  it('formats bytes correctly', () => {
    expect(formatBytes(512)).toBe('512.0 B');
    expect(formatBytes(1023)).toBe('1023.0 B');
  });

  it('formats kilobytes correctly', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes correctly', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25.0 MB');
  });

  it('formats gigabytes correctly', () => {
    expect(formatBytes(1073741824)).toBe('1.0 GB');
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });

  it('respects custom decimal places', () => {
    expect(formatBytes(1536, 2)).toBe('1.50 KB');
    expect(formatBytes(1024, 0)).toBe('1 KB');
  });

  it('handles the exact 25 MB max file size limit', () => {
    const maxBytes = 25 * 1024 * 1024;
    expect(formatBytes(maxBytes)).toBe('25.0 MB');
    // Anything above should still format correctly
    expect(formatBytes(maxBytes + 1)).toBe('25.0 MB');
  });
});

describe('formatNumber', () => {
  it('formats numbers with thousands separator', () => {
    const result = formatNumber(12345);
    // toLocaleString varies by locale but should contain "12" and "345"
    expect(result).toContain('12');
    expect(result).toContain('345');
  });

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('handles small numbers without separator', () => {
    expect(formatNumber(999)).toBe('999');
  });
});

describe('truncate', () => {
  it('does not truncate short strings', () => {
    expect(truncate('hello', 10)).toBe('hello');
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates long strings and adds ellipsis', () => {
    const result = truncate('hello world', 7);
    expect(result).toHaveLength(7);
    expect(result.endsWith('…')).toBe(true);
    expect(result).toBe('hello …');
  });

  it('handles empty string', () => {
    expect(truncate('', 10)).toBe('');
  });

  it('handles maxLen of 1 (only ellipsis)', () => {
    const result = truncate('hello', 1);
    expect(result).toBe('…');
    expect(result).toHaveLength(1);
  });

  it('handles exact length boundary', () => {
    expect(truncate('abc', 3)).toBe('abc');   // no truncation
    expect(truncate('abcd', 3)).toBe('ab…');  // truncate at 4 chars → show 2 + ellipsis
  });

  it('handles typical filename truncation', () => {
    const long = 'factura_empresa_acme_diciembre_2024.pdf';
    const result = truncate(long, 25);
    expect(result).toHaveLength(25);
    expect(result.endsWith('…')).toBe(true);
  });
});
