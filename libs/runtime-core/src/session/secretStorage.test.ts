import { MemoryStore, NativeSecureStore } from '@chatic/storage';

import { prepareSecretStorage, setSecretLogoutPending } from './secretStorage';

jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

/** A vault holding `values`, as the boot step reads it. */
const vaultWith = (values: Record<string, string>) => {
    const held = { ...values };
    const store = new NativeSecureStore({
        fallback: new MemoryStore(),
        channel: {
            read: async () => ({ status: 'available', values: { ...held } }),
            save: async (set, remove) => {
                Object.assign(held, set);
                remove.forEach(key => delete held[key]);
                return true;
            },
            clear: async () => {
                Object.keys(held).forEach(key => delete held[key]);
                return true;
            },
        },
    });
    return { store, held };
};

const boot = (vault: NativeSecureStore, plain: MemoryStore) =>
    prepareSecretStorage({ vault, plain, web: new MemoryStore(), tab: new MemoryStore(), afterLogout: false });

describe('setSecretLogoutPending', () => {
    it('makes the next boot on that plain store finish the logout before reading the vault', async () => {
        const plain = new MemoryStore();
        const { store, held } = vaultWith({ 'chatic-relay-token': 'left-by-a-refused-clear' });

        setSecretLogoutPending(plain, true);

        await expect(boot(store, plain)).resolves.toBe('logout-finished');
        expect(held).toEqual({});
    });

    it('leaves a later sign-in alone once the clear was confirmed', async () => {
        const plain = new MemoryStore();
        const { store, held } = vaultWith({ 'chatic-relay-token': 'signed-in-later' });

        setSecretLogoutPending(plain, true);
        setSecretLogoutPending(plain, false);

        await expect(boot(store, plain)).resolves.toBe('vault');
        expect(held).toEqual({ 'chatic-relay-token': 'signed-in-later' });
    });
});
