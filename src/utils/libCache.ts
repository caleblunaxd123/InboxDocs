/**
 * Downloads and caches PDF.js, Mammoth.js, and SheetJS for offline document viewing.
 * Libraries are stored in the app's cache directory and served from there on subsequent calls.
 */
import * as FileSystem from 'expo-file-system/legacy';

const LIBS_DIR = `${FileSystem.cacheDirectory}inboxdocs_libs/`;

const LIBS = {
  pdfjs: {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    file: 'pdf.min.js',
  },
  pdfworker: {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    file: 'pdf.worker.min.js',
  },
  mammoth: {
    url: 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
    file: 'mammoth.browser.min.js',
  },
  xlsx: {
    url: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
    file: 'xlsx.full.min.js',
  },
} as const;

export type LibName = keyof typeof LIBS;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(LIBS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(LIBS_DIR, { intermediates: true });
  }
}

/**
 * Returns the library as a base64-encoded string, downloading it first if not cached.
 * Throws if offline and the library is not yet cached.
 */
export async function getLibBase64(name: LibName): Promise<string> {
  await ensureDir();
  const lib = LIBS[name];
  const localPath = LIBS_DIR + lib.file;

  const info = await FileSystem.getInfoAsync(localPath);
  if (!info.exists) {
    await FileSystem.downloadAsync(lib.url, localPath);
  }

  return FileSystem.readAsStringAsync(localPath, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/** Returns true if the given library is already cached on device. */
export async function isLibCached(name: LibName): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(LIBS_DIR + LIBS[name].file);
    return info.exists;
  } catch {
    return false;
  }
}

/** Returns true if all libraries required to render PDFs are cached. */
export async function arePdfLibsCached(): Promise<boolean> {
  const [a, b] = await Promise.all([isLibCached('pdfjs'), isLibCached('pdfworker')]);
  return a && b;
}
