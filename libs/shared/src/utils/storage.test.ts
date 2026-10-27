import { safeLocalStorage, safeSessionStorage } from './storage';
import type * as StorageModule from './storage';

/** Replaces a storage global for one test, the way a blocked profile or React Native would present it. */
const replaceGlobal = (name: 'localStorage' | 'sessionStorage', descriptor: PropertyDescriptor) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, ...descriptor });
    return () => {
        if (original) Object.defineProperty(globalThis, name, original);
    };
};

let restore: (() => void) | null = null;

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
});

afterEach(() => {
    restore?.();
    restore = null;
    jest.restoreAllMocks();
});

describe('safeLocalStorage', () => {
    it('reads, writes and removes through localStorage', () => {
        safeLocalStorage.setItem('k', 'v');
        expect(localStorage.getItem('k')).toBe('v');
        expect(safeLocalStorage.getItem('k')).toBe('v');

        safeLocalStorage.removeItem('k');
        expect(safeLocalStorage.getItem('k')).toBeNull();
    });

    it('answers null when a read throws', () => {
        jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });

        expect(safeLocalStorage.getItem('k')).toBeNull();
    });

    it('drops a write that throws, a full quota for one', () => {
        jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('full', 'QuotaExceededError');
        });

        expect(() => safeLocalStorage.setItem('k', 'v')).not.toThrow();
        expect(() => safeLocalStorage.removeItem('k')).not.toThrow();
    });

    // Some browsers throw on the global itself when site data is blocked, not only on its methods.
    it('survives a global that throws when it is named', () => {
        restore = replaceGlobal('localStorage', {
            get: () => {
                throw new DOMException('denied', 'SecurityError');
            },
        });

        expect(safeLocalStorage.getItem('k')).toBeNull();
        expect(() => safeLocalStorage.setItem('k', 'v')).not.toThrow();
    });

    // React Native bundles this barrel and has no web storage: every call has to be a quiet no-op.
    it('is a no-op where there is no localStorage at all', () => {
        restore = replaceGlobal('localStorage', { value: undefined });

        expect(safeLocalStorage.getItem('k')).toBeNull();
        expect(() => safeLocalStorage.setItem('k', 'v')).not.toThrow();
        expect(() => safeLocalStorage.removeItem('k')).not.toThrow();
    });
});

describe('safeSessionStorage', () => {
    it('reads and writes sessionStorage, not localStorage', () => {
        safeSessionStorage.setItem('k', 'v');

        expect(sessionStorage.getItem('k')).toBe('v');
        expect(localStorage.getItem('k')).toBeNull();
    });

    it('is a no-op where there is no sessionStorage at all', () => {
        restore = replaceGlobal('sessionStorage', { value: undefined });

        expect(safeSessionStorage.getItem('k')).toBeNull();
        expect(() => safeSessionStorage.setItem('k', 'v')).not.toThrow();
    });
});

describe('storage', () => {
    // Every app imports this barrel at boot. Where naming sessionStorage throws, the import must still
    // succeed and the session store fall back to a no-op.
    it('imports and falls back to a no-op where naming sessionStorage throws', () => {
        restore = replaceGlobal('sessionStorage', {
            get: () => {
                throw new DOMException('denied', 'SecurityError');
            },
        });

        jest.isolateModules(() => {
            const fresh = require('./storage') as typeof StorageModule;
            expect(() => fresh.storage.set('k', 'v')).not.toThrow();
            expect(fresh.storage.get('k')).toBeNull();
        });
    });
});
