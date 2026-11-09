import * as Keychain from 'react-native-keychain';

import type { ILogService } from '../log';
import { SecureStorageService } from './SecureStorageService';
import type { ISecureStorageInstallFlag } from './types';

jest.mock('react-native', () => ({ AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) } }));
jest.mock('react-native-keychain', () => ({
    getGenericPassword: jest.fn(),
    setGenericPassword: jest.fn(),
    resetGenericPassword: jest.fn(),
    ACCESSIBLE: { AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AccessibleAfterFirstUnlockThisDeviceOnly' },
    STORAGE_TYPE: { AES_GCM_NO_AUTH: 'KeystoreAESGCM_NoAuth' },
}));

const keychain = Keychain as jest.Mocked<typeof Keychain>;
const SERVICE = 'io.chatic.dou.secrets';

const logService = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as ILogService;

const stored = (values: Record<string, string>) =>
    ({
        service: SERVICE,
        username: 'vault',
        password: JSON.stringify(values),
        storage: 'x',
    }) as unknown as Keychain.UserCredentials;

const rejection = (code: string) => Object.assign(new Error(`keychain error ${code}`), { code });

/** A promise whose resolution the test controls. */
const deferred = <T>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => {
        resolve = res;
    });
    return { promise, resolve };
};

const createFlag = (initiallySet = true): ISecureStorageInstallFlag & { value: boolean } => {
    const flag = {
        value: initiallySet,
        isSet: () => flag.value,
        set: () => {
            flag.value = true;
        },
    };
    return flag;
};

const createService = (options: { flag?: ISecureStorageInstallFlag } = {}) => {
    let foreground: () => void = () => undefined;
    const service = new SecureStorageService(
        logService,
        options.flag ?? createFlag(),
        'io.chatic.dou',
        onForeground => {
            foreground = onForeground;
            return () => undefined;
        }
    );
    return { service, foreground: () => foreground() };
};

describe('SecureStorageService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        keychain.resetGenericPassword.mockResolvedValue(true);
        keychain.setGenericPassword.mockResolvedValue({ service: SERVICE, storage: 'x' } as unknown as Keychain.Result);
    });

    describe('start-up read', () => {
        it('answers the stored values when the read succeeds', async () => {
            keychain.getGenericPassword.mockResolvedValue(stored({ token: 'a', refresh: 'b' }));
            const { service } = createService();

            service.start();

            await expect(service.get()).resolves.toEqual({
                status: 'available',
                values: { token: 'a', refresh: 'b' },
            });
            expect(keychain.getGenericPassword).toHaveBeenCalledWith({ service: SERVICE });
            expect(service.keyCount()).toBe(2);
        });

        it('answers an empty vault when there is no item', async () => {
            keychain.getGenericPassword.mockResolvedValue(false);
            const { service } = createService();

            service.start();

            await expect(service.get()).resolves.toEqual({ status: 'available', values: {} });
        });

        it('makes a StorageGet that arrives during the read wait for it', async () => {
            const read = deferred<false | Keychain.UserCredentials>();
            keychain.getGenericPassword.mockReturnValue(read.promise);
            const { service } = createService();
            service.start();

            let answered = false;
            const pending = service.get().then(result => {
                answered = true;
                return result;
            });
            await Promise.resolve();
            expect(answered).toBe(false);

            read.resolve(stored({ token: 'a' }));

            await expect(pending).resolves.toEqual({ status: 'available', values: { token: 'a' } });
            expect(keychain.getGenericPassword).toHaveBeenCalledTimes(1);
        });

        it('reports a locked vault and reads it again on the next StorageGet', async () => {
            keychain.getGenericPassword
                .mockRejectedValueOnce(rejection('-25308'))
                .mockResolvedValueOnce(stored({ token: 'a' }));
            const { service } = createService();
            service.start();

            // The first StorageGet joins the start-up read; the next one reads again.
            await expect(service.get()).resolves.toEqual({ status: 'unavailable', reason: 'locked', values: {} });
            await expect(service.get()).resolves.toEqual({ status: 'available', values: { token: 'a' } });
            expect(keychain.getGenericPassword).toHaveBeenCalledTimes(2);
        });

        it('answers locked while the vault stays locked, never an empty vault', async () => {
            keychain.getGenericPassword.mockRejectedValue(rejection('-25308'));
            const { service } = createService();
            service.start();

            await expect(service.get()).resolves.toEqual({ status: 'unavailable', reason: 'locked', values: {} });
            expect(service.keyCount()).toBeNull();
            expect(keychain.resetGenericPassword).not.toHaveBeenCalled();
        });

        it('reads a locked vault again when the app returns to the foreground', async () => {
            keychain.getGenericPassword
                .mockRejectedValueOnce(rejection('-25308'))
                .mockResolvedValueOnce(stored({ token: 'a' }));
            const { service, foreground } = createService();
            service.start();
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(service.keyCount()).toBeNull();

            foreground();
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(service.keyCount()).toBe(1);
        });

        it('clears an undecryptable Android item and answers available with reset', async () => {
            keychain.getGenericPassword.mockRejectedValue(rejection('E_CRYPTO_FAILED'));
            const { service } = createService();
            service.start();

            await expect(service.get()).resolves.toEqual({ status: 'available', reset: true, values: {} });
            expect(keychain.resetGenericPassword).toHaveBeenCalledWith({ service: SERVICE });
        });

        it('treats a stored value that is not a JSON object of strings as undecryptable', async () => {
            keychain.getGenericPassword.mockResolvedValue({
                ...stored({}),
                password: '{not json',
            } as Keychain.UserCredentials);
            const { service } = createService();
            service.start();

            await expect(service.get()).resolves.toEqual({ status: 'available', reset: true, values: {} });
            expect(keychain.resetGenericPassword).toHaveBeenCalledTimes(1);
        });

        it('stops reporting reset once the web has written into the emptied vault', async () => {
            keychain.getGenericPassword.mockRejectedValue(rejection('E_CRYPTO_FAILED'));
            const { service } = createService();
            service.start();
            await service.get();

            await service.save({ token: 'new' }, []);

            await expect(service.get()).resolves.toEqual({ status: 'available', values: { token: 'new' } });
        });

        it('answers error for any other failure and reads again on the next StorageGet', async () => {
            keychain.getGenericPassword
                .mockRejectedValueOnce(rejection('E_UNKNOWN_ERROR'))
                .mockResolvedValueOnce(stored({ token: 'a' }));
            const { service } = createService();
            service.start();

            await expect(service.get()).resolves.toEqual({ status: 'unavailable', reason: 'error', values: {} });
            expect(keychain.resetGenericPassword).not.toHaveBeenCalled();
            await expect(service.get()).resolves.toEqual({ status: 'available', values: { token: 'a' } });
        });
    });

    describe('reinstall', () => {
        it('clears the keychain item before the first read of a fresh install, then sets the flag', async () => {
            const order: string[] = [];
            keychain.resetGenericPassword.mockImplementation(async () => {
                order.push('reset');
                return true;
            });
            keychain.getGenericPassword.mockImplementation(async () => {
                order.push('read');
                return false;
            });
            const flag = createFlag(false);
            const { service } = createService({ flag });

            service.start();

            await expect(service.get()).resolves.toEqual({ status: 'available', values: {} });
            expect(order).toEqual(['reset', 'read']);
            expect(flag.value).toBe(true);
        });

        it('leaves the item alone when the flag is already set', async () => {
            keychain.getGenericPassword.mockResolvedValue(stored({ token: 'a' }));
            const { service } = createService({ flag: createFlag(true) });

            service.start();
            await service.get();

            expect(keychain.resetGenericPassword).not.toHaveBeenCalled();
        });

        it('keeps the flag unset when the clear fails, so the next launch tries again', async () => {
            keychain.resetGenericPassword.mockRejectedValue(rejection('-25308'));
            const flag = createFlag(false);
            const { service } = createService({ flag });

            service.start();

            await expect(service.get()).resolves.toEqual({ status: 'unavailable', reason: 'locked', values: {} });
            expect(flag.value).toBe(false);
            expect(keychain.getGenericPassword).not.toHaveBeenCalled();
        });
    });

    describe('save', () => {
        it('writes the whole vault and answers ok only after the keychain write resolved', async () => {
            keychain.getGenericPassword.mockResolvedValue(stored({ keep: '1', drop: '2' }));
            const write = deferred<false | Keychain.Result>();
            keychain.setGenericPassword.mockReturnValue(write.promise);
            const { service } = createService();
            service.start();
            await service.get();

            let settled = false;
            const pending = service.save({ added: '3' }, ['drop']).then(ok => {
                settled = true;
                return ok;
            });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(settled).toBe(false);

            write.resolve({ service: SERVICE, storage: 'x' } as unknown as Keychain.Result);

            await expect(pending).resolves.toBe(true);
            expect(keychain.setGenericPassword).toHaveBeenCalledWith(
                'vault',
                JSON.stringify({ keep: '1', added: '3' }),
                {
                    service: SERVICE,
                    accessible: 'AccessibleAfterFirstUnlockThisDeviceOnly',
                    storage: 'KeystoreAESGCM_NoAuth',
                }
            );
            await expect(service.get()).resolves.toEqual({ status: 'available', values: { keep: '1', added: '3' } });
        });

        it('waits for the start-up read before writing', async () => {
            const read = deferred<false | Keychain.UserCredentials>();
            keychain.getGenericPassword.mockReturnValue(read.promise);
            const { service } = createService();
            service.start();

            const pending = service.save({ added: '3' }, []);
            read.resolve(stored({ keep: '1' }));

            await expect(pending).resolves.toBe(true);
            expect(keychain.setGenericPassword).toHaveBeenCalledWith(
                'vault',
                JSON.stringify({ keep: '1', added: '3' }),
                expect.anything()
            );
        });

        it('runs writes one at a time, in order', async () => {
            keychain.getGenericPassword.mockResolvedValue(false);
            const first = deferred<false | Keychain.Result>();
            keychain.setGenericPassword
                .mockReturnValueOnce(first.promise)
                .mockResolvedValueOnce({ service: SERVICE, storage: 'x' } as unknown as Keychain.Result);
            const { service } = createService();
            service.start();
            await service.get();

            const one = service.save({ a: '1' }, []);
            const two = service.save({ b: '2' }, []);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(keychain.setGenericPassword).toHaveBeenCalledTimes(1);

            first.resolve({ service: SERVICE, storage: 'x' } as unknown as Keychain.Result);

            await expect(Promise.all([one, two])).resolves.toEqual([true, true]);
            expect(keychain.setGenericPassword.mock.calls.map(call => call[1])).toEqual([
                JSON.stringify({ a: '1' }),
                JSON.stringify({ a: '1', b: '2' }),
            ]);
        });

        it('answers false on a failed write and leaves the vault unavailable for the run', async () => {
            keychain.getGenericPassword.mockResolvedValue(stored({ token: 'a' }));
            keychain.setGenericPassword.mockRejectedValueOnce(rejection('-34018'));
            const { service } = createService();
            service.start();
            await service.get();

            await expect(service.save({ token: 'b' }, [])).resolves.toBe(false);

            await expect(service.get()).resolves.toEqual({ status: 'unavailable', reason: 'error', values: {} });
            expect(service.keyCount()).toBeNull();
            // Unavailable for the run: no later write is attempted either.
            await expect(service.save({ token: 'c' }, [])).resolves.toBe(false);
            expect(keychain.setGenericPassword).toHaveBeenCalledTimes(1);
        });

        it('treats a write the module answers false as failed', async () => {
            keychain.getGenericPassword.mockResolvedValue(false);
            keychain.setGenericPassword.mockResolvedValueOnce(false);
            const { service } = createService();
            service.start();
            await service.get();

            await expect(service.save({ token: 'b' }, [])).resolves.toBe(false);
            await expect(service.get()).resolves.toEqual({ status: 'unavailable', reason: 'error', values: {} });
        });

        it('refuses to write over a vault it could not read', async () => {
            keychain.getGenericPassword.mockRejectedValue(rejection('-25308'));
            const { service } = createService();
            service.start();
            await service.get();

            await expect(service.save({ token: 'b' }, [])).resolves.toBe(false);
            expect(keychain.setGenericPassword).not.toHaveBeenCalled();
        });
    });

    describe('clear', () => {
        it('deletes the item and empties the copy in memory', async () => {
            keychain.getGenericPassword.mockResolvedValue(stored({ token: 'a' }));
            const { service } = createService();
            service.start();
            await service.get();

            await expect(service.clear()).resolves.toBe(true);

            expect(keychain.resetGenericPassword).toHaveBeenCalledWith({ service: SERVICE });
            await expect(service.get()).resolves.toEqual({ status: 'available', values: {} });
        });

        it('answers ok only after the delete resolved', async () => {
            keychain.getGenericPassword.mockResolvedValue(false);
            const reset = deferred<boolean>();
            const { service } = createService();
            service.start();
            await service.get();
            keychain.resetGenericPassword.mockReturnValue(reset.promise);

            let settled = false;
            const pending = service.clear().then(ok => {
                settled = true;
                return ok;
            });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(settled).toBe(false);

            reset.resolve(true);
            await expect(pending).resolves.toBe(true);
        });

        it('answers false when the delete fails and keeps the values', async () => {
            keychain.getGenericPassword.mockResolvedValue(stored({ token: 'a' }));
            const { service } = createService();
            service.start();
            await service.get();
            keychain.resetGenericPassword.mockRejectedValueOnce(rejection('E_UNKNOWN_ERROR'));

            await expect(service.clear()).resolves.toBe(false);
            expect(service.keyCount()).toBe(1);
        });
    });
});
