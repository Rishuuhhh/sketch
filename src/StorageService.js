/** @import { Stroke } from './types.js' */

const STORAGE_KEY = 'wsa_strokes';

/**
 * Creates a StorageService that persists strokes to a storage backend.
 *
 * @param {Storage} [storage] - Storage backend (defaults to window.localStorage)
 * @returns {{ save: (strokes: Stroke[]) => void, load: () => Stroke[] | null }}
 */
export function createStorageService(storage = window.localStorage) {
  return {
    /**
     * Serializes strokes to JSON and writes to storage.
     * Catches QuotaExceededError and logs a warning without crashing.
     *
     * @param {Stroke[]} strokes
     */
    save(strokes) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(strokes));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
          console.warn('[StorageService] localStorage quota exceeded — strokes not persisted.');
        } else {
          throw err;
        }
      }
    },

    /**
     * Reads and parses strokes from storage.
     * Returns null if nothing is stored or if the stored value is malformed JSON.
     *
     * @returns {Stroke[] | null}
     */
    load() {
      try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw === null) return null;
        return JSON.parse(raw);
      } catch {
        console.warn('[StorageService] Failed to parse stored strokes — returning null.');
        return null;
      }
    },
  };
}
