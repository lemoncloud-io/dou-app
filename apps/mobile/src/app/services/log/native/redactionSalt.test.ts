import { loadOrCreateRedactionSalt, type RedactionSaltStore } from './redactionSalt';

jest.mock('react-native-mmkv', () => ({ createMMKV: jest.fn() }));

const memoryStore = (initial?: string): RedactionSaltStore & { value?: string } => {
    const store = {
        value: initial,
        getString: () => store.value,
        set: (_key: string, value: string) => {
            store.value = value;
        },
    };
    return store;
};

describe('loadOrCreateRedactionSalt', () => {
    it('creates and stores a salt on first launch, then returns the stored one', () => {
        const store = memoryStore();

        const first = loadOrCreateRedactionSalt(store);

        expect(first).toMatch(/^[0-9a-f]{32}$/);
        expect(store.value).toBe(first);
        expect(loadOrCreateRedactionSalt(store)).toBe(first);
    });

    it('replaces a stored value too short to be a salt', () => {
        const store = memoryStore('short');

        const salt = loadOrCreateRedactionSalt(store);

        expect(salt).not.toBe('short');
        expect(store.value).toBe(salt);
    });

    it('stores and returns nothing where there is no cryptographic random source', () => {
        const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
        Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
        try {
            const store = memoryStore();

            expect(loadOrCreateRedactionSalt(store)).toBeUndefined();
            expect(store.value).toBeUndefined();
        } finally {
            if (original) Object.defineProperty(globalThis, 'crypto', original);
        }
    });

    it('still returns a salt when the store throws', () => {
        const broken: RedactionSaltStore = {
            getString: () => {
                throw new Error('read');
            },
            set: () => {
                throw new Error('write');
            },
        };

        expect(loadOrCreateRedactionSalt(broken)).toMatch(/^[0-9a-f]{32}$/);
    });
});
