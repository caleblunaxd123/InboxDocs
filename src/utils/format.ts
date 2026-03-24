/**
 * Format a byte count into a human-readable string.
 * e.g. 1024 → "1.0 KB", 1048576 → "1.0 MB"
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(decimals)} ${sizes[i] ?? 'GB'}`;
}

/**
 * Format a number with thousands separator.
 * e.g. 12345 → "12,345"
 */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Truncate a string to maxLen characters, adding ellipsis if needed.
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}
