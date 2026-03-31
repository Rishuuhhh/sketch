import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { createStorageService } from '../src/StorageService.js';

// Simple in-memory Storage implementation for testing
function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (i) => [...store.keys()][i] ?? null,
    _store: store,
  };
}

// Arbitraries
// Use only finite, non-special floats: JSON cannot represent -0, Infinity, -Infinity, or NaN
const safeFloat = fc.float({ noNaN: true, noDefaultInfinity: true }).filter(n => !Object.is(n, -0) && isFinite(n));
const pointArb = fc.record({ x: safeFloat, y: safeFloat });
const strokeArb = fc.record({
  id: fc.string({ minLength: 1 }),
  tool: fc.constantFrom('pen', 'eraser', 'clear'),
  color: fc.hexaString({ minLength: 6, maxLength: 6 }).map(h => `#${h}`),
  width: fc.integer({ min: 1, max: 50 }),
  points: fc.array(pointArb),
});

describe('StorageService', () => {
  let storage;
  let service;

  beforeEach(() => {
    storage = createMemoryStorage();
    service = createStorageService(storage);
  });

  // --- Unit tests ---

  it('load() returns null when storage is empty', () => {
    expect(service.load()).toBeNull();
  });

  it('save() then load() round-trips a simple stroke array', () => {
    const strokes = [
      { id: '1700000000000', tool: 'pen', color: '#e63946', width: 4, points: [{ x: 10, y: 20 }] },
    ];
    service.save(strokes);
    expect(service.load()).toEqual(strokes);
  });

  it('load() returns null for malformed JSON', () => {
    storage.setItem('wsa_strokes', '{not valid json}');
    expect(service.load()).toBeNull();
  });

  it('save() catches QuotaExceededError and logs a warning without throwing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const quota = new DOMException('QuotaExceededError', 'QuotaExceededError');
    storage.setItem = () => { throw quota; };

    expect(() => service.save([])).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('quota exceeded'));

    warnSpy.mockRestore();
  });

  it('save() re-throws non-quota errors', () => {
    storage.setItem = () => { throw new Error('unexpected'); };
    expect(() => service.save([])).toThrow('unexpected');
  });

  it('save() stores under the key wsa_strokes', () => {
    service.save([]);
    expect(storage.getItem('wsa_strokes')).toBe('[]');
  });

  it('load() returns null and logs warning for malformed JSON', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.setItem('wsa_strokes', 'not-json');
    expect(service.load()).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // --- Property-based test ---

  it('Property 7: persistence round trip', () => {
    // Feature: whiteboard-sketch-app, Property 7: Persistence round trip
    // Validates: Requirements 6.1, 6.2, 6.3
    fc.assert(
      fc.property(fc.array(strokeArb), (strokes) => {
        const mem = createMemoryStorage();
        const svc = createStorageService(mem);
        svc.save(strokes);
        const loaded = svc.load();
        expect(loaded).toEqual(strokes);
      }),
      { numRuns: 100 }
    );
  });
});
