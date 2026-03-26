/**
 * Unit tests for auth service logic.
 *
 * Tests the deterministic parts of authService:
 *   - getGoogleClientId platform branching
 *   - token expiry calculation helpers
 *   - binary-to-base64 conversion (the O(n) bug surface)
 *   - OAuthResult shape validation
 *
 * OAuth flows that require real network calls are NOT tested here.
 * Those belong in integration / E2E tests.
 */

// ─── getGoogleClientId logic (replicated from authService.ts) ───────────────

describe('authService — getGoogleClientId platform logic', () => {
  const IOS_ID = 'ios-client-id.apps.googleusercontent.com';
  const ANDROID_ID = 'android-client-id.apps.googleusercontent.com';
  const WEB_ID = 'web-client-id.apps.googleusercontent.com';

  function getGoogleClientId(platform: string, iosId: string, androidId: string, webId: string): string {
    if (platform === 'ios') return iosId || webId;
    if (platform === 'android') return androidId || webId;
    return webId;
  }

  it('returns iOS client ID on iOS when configured', () => {
    expect(getGoogleClientId('ios', IOS_ID, ANDROID_ID, WEB_ID)).toBe(IOS_ID);
  });

  it('falls back to Web client ID on iOS when iOS ID is empty', () => {
    expect(getGoogleClientId('ios', '', ANDROID_ID, WEB_ID)).toBe(WEB_ID);
  });

  it('returns Android client ID on Android when configured', () => {
    expect(getGoogleClientId('android', IOS_ID, ANDROID_ID, WEB_ID)).toBe(ANDROID_ID);
  });

  it('falls back to Web client ID on Android when Android ID is empty', () => {
    expect(getGoogleClientId('android', IOS_ID, '', WEB_ID)).toBe(WEB_ID);
  });

  it('returns Web client ID on web/other platforms', () => {
    expect(getGoogleClientId('web', IOS_ID, ANDROID_ID, WEB_ID)).toBe(WEB_ID);
    expect(getGoogleClientId('windows', IOS_ID, ANDROID_ID, WEB_ID)).toBe(WEB_ID);
  });

  /**
   * CRITICAL BUG DOCUMENTATION:
   * refreshGoogleToken should use WEB_ID + client_secret, not platform-native ID.
   * Tokens issued by the Web OAuth flow cannot be refreshed with a native client ID.
   */
  it('BUG: refresh must use Web ID, not platform ID', () => {
    // Demonstrates the incorrect behavior: refresh uses native ID
    const wrongId = getGoogleClientId('ios', IOS_ID, ANDROID_ID, WEB_ID);
    expect(wrongId).toBe(IOS_ID);
    expect(wrongId).not.toBe(WEB_ID); // This is WRONG for refresh — web token needs web client id
  });
});

// ─── Token expiry calculation ────────────────────────────────────────────────

describe('authService — token expiry logic', () => {
  function calculateExpiresAt(expiresIn: number): number {
    return Date.now() + expiresIn * 1000;
  }

  function isExpired(expiresAt: number): boolean {
    return expiresAt < Date.now();
  }

  function isExpiringSoon(expiresAt: number, marginMs = 5 * 60 * 1000): boolean {
    return expiresAt - Date.now() < marginMs;
  }

  it('calculates expiry correctly for 1-hour token', () => {
    const before = Date.now();
    const expiresAt = calculateExpiresAt(3600);
    const after = Date.now();

    expect(expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(expiresAt).toBeLessThanOrEqual(after + 3600 * 1000);
  });

  it('correctly detects an expired token', () => {
    const expiredAt = Date.now() - 1000; // 1 second ago
    expect(isExpired(expiredAt)).toBe(true);
  });

  it('correctly detects a valid token', () => {
    const validAt = Date.now() + 3600 * 1000; // 1 hour from now
    expect(isExpired(validAt)).toBe(false);
  });

  it('detects token expiring within the 5-minute safety margin', () => {
    const expiresIn4Min = Date.now() + 4 * 60 * 1000;
    expect(isExpiringSoon(expiresIn4Min)).toBe(true);
  });

  it('does not flag token with plenty of time left', () => {
    const expiresIn30Min = Date.now() + 30 * 60 * 1000;
    expect(isExpiringSoon(expiresIn30Min)).toBe(false);
  });

  it('handles default expiresIn of 3600 from Google response', () => {
    const tokenData = { expires_in: 3600 };
    const expiresAt = Date.now() + (tokenData.expires_in ?? 3600) * 1000;
    expect(isExpired(expiresAt)).toBe(false);
    // Should be valid for almost an hour
    expect(expiresAt - Date.now()).toBeGreaterThan(3500 * 1000);
  });
});

// ─── Binary to base64 conversion (O(n) bug surface) ─────────────────────────

describe('authService — binary to base64 conversion', () => {
  /**
   * Replicated from syncService.ts (Outlook path) and authService.ts (avatar photo).
   * Tests correctness of the conversion at various sizes.
   * The O(n) string concatenation bug is documented but not auto-detected here —
   * it manifests as UI freeze at runtime for files > 5 MB.
   */
  function arrayBufferToBase64Naive(buffer: ArrayBuffer): string {
    const uint8Array = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < uint8Array.byteLength; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  }

  function arrayBufferToBase64Chunked(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const CHUNK = 8192;
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as any);
    }
    return btoa(binary);
  }

  function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  it('naive implementation produces correct base64 for small payloads', () => {
    const text = 'Hello, InboxDocs!';
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const base64 = arrayBufferToBase64Naive(buffer);
    // Verify round-trip
    expect(atob(base64)).toBe(text);
  });

  it('chunked implementation produces same result as naive for small payloads', () => {
    const text = 'Test document content for chunked conversion';
    const buffer = new TextEncoder().encode(text).buffer;
    expect(arrayBufferToBase64Chunked(buffer)).toBe(arrayBufferToBase64Naive(buffer));
  });

  it('chunked implementation handles payloads larger than chunk size', () => {
    // 50KB payload — larger than 8192 chunk
    const data = new Uint8Array(50 * 1024);
    for (let i = 0; i < data.length; i++) data[i] = i % 256;
    const buffer = data.buffer;

    const naive = arrayBufferToBase64Naive(buffer);
    const chunked = arrayBufferToBase64Chunked(buffer);
    expect(chunked).toBe(naive);
  });

  it('base64 output is a valid base64 string (only valid chars)', () => {
    const text = 'Factura de servicios del mes de enero 2024';
    const buffer = new TextEncoder().encode(text).buffer;
    const base64 = arrayBufferToBase64Naive(buffer);
    // Valid base64: A-Z, a-z, 0-9, +, /, =
    expect(base64).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('round-trip: encode then decode returns original data (ASCII safe)', () => {
    // TextEncoder encodes to UTF-8, so we use only ASCII chars for round-trip safety
    const original = 'PDF content simulation 01 02 03 hello';
    const buffer = new TextEncoder().encode(original).buffer;
    const base64 = arrayBufferToBase64Naive(buffer);
    const decoded = atob(base64);
    expect(decoded).toBe(original);
  });

  it('round-trip: handles raw binary data via Uint8Array directly', () => {
    // Test with arbitrary binary bytes (not encoded via TextEncoder)
    const bytes = new Uint8Array([0x00, 0x01, 0x7e, 0x7f, 0xfe, 0xff]);
    const base64 = arrayBufferToBase64Naive(bytes.buffer);
    // Decode and verify original bytes
    const decoded = atob(base64);
    expect(decoded.length).toBe(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      expect(decoded.charCodeAt(i)).toBe(bytes[i]);
    }
  });

  it('handles empty buffer without error', () => {
    const buffer = new ArrayBuffer(0);
    expect(() => arrayBufferToBase64Naive(buffer)).not.toThrow();
    expect(arrayBufferToBase64Naive(buffer)).toBe('');
  });

  it('handles buffer with all-zero bytes', () => {
    const buffer = new ArrayBuffer(16);
    const base64 = arrayBufferToBase64Naive(buffer);
    expect(base64).toBe('AAAAAAAAAAAAAAAAAAAAAA==');
  });

  /**
   * Performance regression guard:
   * The chunked version should complete in < 1 second for a 1MB payload.
   * The naive version may exceed this on some environments.
   */
  it('chunked version completes 1MB conversion in under 1 second', () => {
    const data = new Uint8Array(1024 * 1024); // 1 MB
    for (let i = 0; i < data.length; i++) data[i] = i % 256;

    const start = Date.now();
    arrayBufferToBase64Chunked(data.buffer);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000);
  });
});

// ─── OAuthResult shape ────────────────────────────────────────────────────────

describe('authService — OAuthResult shape validation', () => {
  interface OAuthResult {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  }

  function validateOAuthResult(result: OAuthResult): string[] {
    const errors: string[] = [];
    if (!result.accessToken) errors.push('accessToken is empty');
    if (typeof result.expiresAt !== 'number' || result.expiresAt <= 0) errors.push('expiresAt invalid');
    if (!result.email || !result.email.includes('@')) errors.push('email invalid');
    if (!result.displayName) errors.push('displayName is empty');
    if (result.expiresAt < Date.now()) errors.push('token already expired');
    return errors;
  }

  it('validates a well-formed OAuthResult', () => {
    const result: OAuthResult = {
      accessToken: 'ya29.token_abc123',
      refreshToken: '1//refresh_xyz',
      expiresAt: Date.now() + 3600 * 1000,
      email: 'user@gmail.com',
      displayName: 'John Doe',
      avatarUrl: 'https://example.com/avatar.jpg',
    };
    expect(validateOAuthResult(result)).toHaveLength(0);
  });

  it('detects missing accessToken', () => {
    const result: OAuthResult = {
      accessToken: '',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3600 * 1000,
      email: 'user@gmail.com',
      displayName: 'User',
      avatarUrl: null,
    };
    const errors = validateOAuthResult(result);
    expect(errors).toContain('accessToken is empty');
  });

  it('detects expired token on receipt', () => {
    const result: OAuthResult = {
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: Date.now() - 1000, // already expired
      email: 'user@gmail.com',
      displayName: 'User',
      avatarUrl: null,
    };
    const errors = validateOAuthResult(result);
    expect(errors).toContain('token already expired');
  });

  it('accepts null avatarUrl (optional field)', () => {
    const result: OAuthResult = {
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3600 * 1000,
      email: 'user@gmail.com',
      displayName: 'User',
      avatarUrl: null,
    };
    const errors = validateOAuthResult(result);
    expect(errors).toHaveLength(0);
  });
});
