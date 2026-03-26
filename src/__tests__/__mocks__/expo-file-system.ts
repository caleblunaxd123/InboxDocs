export const documentDirectory = '/mock/documents/';
export const cacheDirectory = '/mock/cache/';
export const EncodingType = { UTF8: 'utf8', Base64: 'base64' };

export function getInfoAsync() {
  return Promise.resolve({ exists: true, isDirectory: false });
}
export function makeDirectoryAsync() {
  return Promise.resolve();
}
export function writeAsStringAsync() {
  return Promise.resolve();
}
export function deleteAsync() {
  return Promise.resolve();
}
