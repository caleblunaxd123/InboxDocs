const store: Record<string, string> = {};

export function setItemAsync(key: string, value: string) {
  store[key] = value;
  return Promise.resolve();
}

export function getItemAsync(key: string) {
  return Promise.resolve(store[key] ?? null);
}

export function deleteItemAsync(key: string) {
  delete store[key];
  return Promise.resolve();
}
