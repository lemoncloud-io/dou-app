import { SecureStorage } from './secureStorage';
import type { SafeStorageLike, SecureStorageDeps, SecureStorageFs } from './types';

const FILE = '/user-data/secrets.bin';

const enoent = (): Error => Object.assign(new Error('no such file'), { code: 'ENOENT' });

/** An in-memory file system with the four calls the vault makes, each spied. */
const createFs = (initial: Record<string, Buffer> = {}) => {
    const files = new Map(Object.entries(initial));
    const fs = {
        readFile: jest.fn(async (path: string) => {
            const data = files.get(path);
            if (!data) throw enoent();
            return data;
        }),
        writeFile: jest.fn(async (path: string, data: Buffer) => {
            files.set(path, data);
        }),
        rename: jest.fn(async (from: string, to: string) => {
            const data = files.get(from);
            if (!data) throw enoent();
            files.delete(from);
            files.set(to, data);
        }),
        rm: jest.fn(async (path: string) => {
            files.delete(path);
        }),
    } satisfies SecureStorageFs;
    return { fs, files };
};

/** "Encrypts" by prefixing, so a test can write a vault file and read one back. */
const createSafeStorage = (overrides: Partial<SafeStorageLike> = {}): jest.Mocked<SafeStorageLike> => ({
    isEncryptionAvailable: jest.fn(() => true),
    getSelectedStorageBackend: jest.fn(() => 'gnome_libsecret'),
    encryptString: jest.fn((plain: string) => Buffer.from(`enc:${plain}`)),
    decryptString: jest.fn((data: Buffer) => {
        const text = data.toString();
        if (!text.startsWith('enc:')) throw new Error('Error while decrypting the ciphertext');
        return text.slice(4);
    }),
    ...(overrides as object),
});

const vaultFile = (values: Record<string, string>): Buffer => Buffer.from(`enc:${JSON.stringify(values)}`);

const createVault = (overrides: Partial<SecureStorageDeps> = {}, initial: Record<string, Buffer> = {}) => {
    const { fs, files } = createFs(initial);
    const safeStorage = createSafeStorage();
    const vault = new SecureStorage({
        safeStorage,
        fs,
        filePath: FILE,
        platform: 'darwin',
        logError: jest.fn(),
        ...overrides,
    });
    return { vault, fs, files, safeStorage };
};

const readBack = (files: Map<string, Buffer>): unknown => {
    const data = files.get(FILE);
    return data ? JSON.parse(data.toString().slice(4)) : undefined;
};

describe('SecureStorage start read', () => {
    it('is available and empty when no vault file exists', async () => {
        const { vault } = createVault();

        await vault.start();

        await expect(vault.get()).resolves.toEqual({ status: 'available', values: {} });
    });

    it('loads the values of an existing vault', async () => {
        const { vault } = createVault({}, { [FILE]: vaultFile({ token: 'abc' }) });

        await vault.start();

        await expect(vault.get()).resolves.toEqual({ status: 'available', values: { token: 'abc' } });
    });

    it('is unavailable when encryption is not available', async () => {
        const { fs } = createFs({ [FILE]: vaultFile({ token: 'abc' }) });
        const safeStorage = createSafeStorage({ isEncryptionAvailable: jest.fn(() => false) });
        const vault = new SecureStorage({ safeStorage, fs, filePath: FILE, platform: 'darwin', logError: jest.fn() });

        await expect(vault.get()).resolves.toEqual({ status: 'unavailable', reason: 'error', values: {} });
        expect(fs.readFile).not.toHaveBeenCalled();
    });

    it('is unavailable on Linux when safeStorage fell back to basic_text', async () => {
        const { fs } = createFs();
        const safeStorage = createSafeStorage({ getSelectedStorageBackend: jest.fn(() => 'basic_text') });
        const vault = new SecureStorage({ safeStorage, fs, filePath: FILE, platform: 'linux', logError: jest.fn() });

        await expect(vault.get()).resolves.toEqual({ status: 'unavailable', reason: 'error', values: {} });
    });

    it('asks for the storage backend only on Linux', async () => {
        const { vault, safeStorage } = createVault({ platform: 'win32' });

        await vault.start();

        expect(safeStorage.getSelectedStorageBackend).not.toHaveBeenCalled();
    });

    it('deletes a vault it cannot decrypt and starts over empty with reset', async () => {
        const { vault, fs, files } = createVault({}, { [FILE]: Buffer.from('written under another account') });

        await expect(vault.get()).resolves.toEqual({ status: 'available', reset: true, values: {} });
        expect(fs.rm).toHaveBeenCalledWith(FILE, { force: true });
        expect(files.has(FILE)).toBe(false);
    });

    it('treats a vault that decrypts to something other than a string record as undecryptable', async () => {
        const { vault, files } = createVault({}, { [FILE]: Buffer.from('enc:{"token":1}') });

        await expect(vault.get()).resolves.toEqual({ status: 'available', reset: true, values: {} });
        expect(files.has(FILE)).toBe(false);
    });

    it('is unavailable on a read error other than a missing file, and keeps the file', async () => {
        const { vault, fs, files } = createVault({}, { [FILE]: vaultFile({ token: 'abc' }) });
        fs.readFile.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }));

        await expect(vault.get()).resolves.toEqual({ status: 'unavailable', reason: 'error', values: {} });
        expect(files.has(FILE)).toBe(true);
    });

    it('makes a StorageGet that arrives before the start read wait for it', async () => {
        const { vault, fs } = createVault();
        let finishRead: (data: Buffer) => void = () => undefined;
        fs.readFile.mockImplementationOnce(() => new Promise(resolve => (finishRead = resolve)));

        void vault.start();
        let answered: unknown;
        const pending = vault.get().then(snapshot => (answered = snapshot));
        await new Promise(resolve => setImmediate(resolve));

        expect(answered).toBeUndefined();
        finishRead(vaultFile({ token: 'abc' }));
        await pending;
        expect(answered).toEqual({ status: 'available', values: { token: 'abc' } });
        expect(fs.readFile).toHaveBeenCalledTimes(1);
    });
});

describe('SecureStorage save', () => {
    it('answers ok only after the vault file is written, through a temp file and a rename', async () => {
        const { vault, fs, files } = createVault({}, { [FILE]: vaultFile({ keep: 'k', old: 'o' }) });

        await expect(vault.save({ token: 'abc' }, ['old'])).resolves.toBe(true);

        expect(fs.writeFile).toHaveBeenCalledWith(`${FILE}.tmp`, expect.any(Buffer), { mode: 0o600 });
        expect(fs.rename).toHaveBeenCalledWith(`${FILE}.tmp`, FILE);
        expect(readBack(files)).toEqual({ keep: 'k', token: 'abc' });
        await expect(vault.get()).resolves.toEqual({ status: 'available', values: { keep: 'k', token: 'abc' } });
    });

    it('does not answer before the write has finished', async () => {
        const { vault, fs, files } = createVault();
        await vault.start();
        let finishWrite: () => void = () => undefined;
        fs.writeFile.mockImplementationOnce(async (path: string, data: Buffer) => {
            await new Promise<void>(resolve => (finishWrite = resolve));
            files.set(path, data);
        });

        let ok: boolean | undefined;
        const pending = vault.save({ token: 'abc' }, []).then(result => (ok = result));
        await new Promise(resolve => setImmediate(resolve));

        expect(ok).toBeUndefined();
        finishWrite();
        await pending;
        expect(ok).toBe(true);
    });

    it('answers not ok on a failed write and stays unavailable for the rest of the run', async () => {
        const { vault, fs, files } = createVault({}, { [FILE]: vaultFile({ token: 'abc' }) });
        fs.rename.mockRejectedValueOnce(new Error('disk full'));

        await expect(vault.save({ token: 'new' }, [])).resolves.toBe(false);

        expect(files.has(`${FILE}.tmp`)).toBe(false);
        expect(readBack(files)).toEqual({ token: 'abc' });
        await expect(vault.get()).resolves.toEqual({ status: 'unavailable', reason: 'error', values: {} });
        await expect(vault.save({ token: 'again' }, [])).resolves.toBe(false);
        expect(fs.writeFile).toHaveBeenCalledTimes(1);
    });

    it('answers not ok when encryption itself fails', async () => {
        const { vault, safeStorage } = createVault();
        safeStorage.encryptString.mockImplementationOnce(() => {
            throw new Error('keychain locked');
        });

        await expect(vault.save({ token: 'abc' }, [])).resolves.toBe(false);
        await expect(vault.get()).resolves.toEqual({ status: 'unavailable', reason: 'error', values: {} });
    });

    it('answers not ok while the vault is unavailable, without writing', async () => {
        const { fs } = createFs();
        const safeStorage = createSafeStorage({ isEncryptionAvailable: jest.fn(() => false) });
        const vault = new SecureStorage({ safeStorage, fs, filePath: FILE, platform: 'darwin', logError: jest.fn() });

        await expect(vault.save({ token: 'abc' }, [])).resolves.toBe(false);
        expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('runs saves one at a time in the order they arrived', async () => {
        const { vault, fs, files } = createVault();
        await vault.start();
        const releases: Array<() => void> = [];
        fs.writeFile.mockImplementation(async (path: string, data: Buffer) => {
            await new Promise<void>(resolve => releases.push(resolve));
            files.set(path, data);
        });

        const first = vault.save({ a: '1' }, []);
        const second = vault.save({ b: '2' }, []);
        await new Promise(resolve => setImmediate(resolve));
        expect(releases).toHaveLength(1);
        releases[0]();
        await first;
        await new Promise(resolve => setImmediate(resolve));
        releases[1]();
        await second;

        expect(readBack(files)).toEqual({ a: '1', b: '2' });
    });

    it('drops the reset flag once a save lands', async () => {
        const { vault } = createVault({}, { [FILE]: Buffer.from('garbage') });

        await vault.save({ token: 'abc' }, []);

        await expect(vault.get()).resolves.toEqual({ status: 'available', values: { token: 'abc' } });
    });
});

describe('SecureStorage clear', () => {
    it('deletes the vault file and empties memory before answering ok', async () => {
        const { vault, fs, files } = createVault({}, { [FILE]: vaultFile({ token: 'abc' }) });

        await expect(vault.clear()).resolves.toBe(true);

        expect(fs.rm).toHaveBeenCalledWith(FILE, { force: true });
        expect(files.has(FILE)).toBe(false);
        await expect(vault.get()).resolves.toEqual({ status: 'available', values: {} });
    });

    it('answers not ok when the file cannot be deleted, and keeps the values', async () => {
        const { vault, fs } = createVault({}, { [FILE]: vaultFile({ token: 'abc' }) });
        await vault.start();
        fs.rm.mockRejectedValueOnce(new Error('busy'));

        await expect(vault.clear()).resolves.toBe(false);
        await expect(vault.get()).resolves.toEqual({ status: 'available', values: { token: 'abc' } });
    });
});
