/** Browser storage is optional (private mode, denied access, or a full quota). */
export interface StorageReader {
  getItem(key: string): string | null;
}

export function readStoredValue(key: string, storage?: StorageReader): string | null {
  try {
    return (storage ?? localStorage).getItem(key);
  } catch {
    return null;
  }
}

export function readStoredJson(key: string, storage?: StorageReader): unknown {
  const value = readStoredValue(key, storage);
  if (value === null) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function writeStoredValue(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStoredValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Layout preferences must never prevent using the archive. */
  }
}
