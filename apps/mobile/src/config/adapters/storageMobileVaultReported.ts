import { loadNativeSession, nativeStoragePorts, storageMobileVault } from '@chatic/runtime-mobile';
import type { MobileAdapter, MobileVaultStorageOptions, NativeSessionLoad } from '@chatic/runtime-mobile';

export interface ReportedVaultStorageOptions extends MobileVaultStorageOptions {
    /** Hears how the session's secrets were found, once the vault is loaded and holds a session. */
    onLoad: (load: NativeSessionLoad) => void;
}

/**
 * `storage.mobile-vault`, building and loading the stores exactly as the package's adapter does, and
 * handing on how the load went. The app logs that — the vault's first answer and the secret-storage
 * step's row — when the runtime has started, and the package's adapter keeps it to itself. Same id and
 * port as `storageMobileVault`, so a config toggle and a log line name it the same way.
 */
export const storageMobileVaultReported = ({
    onLoad,
    ...options
}: ReportedVaultStorageOptions): MobileAdapter<'storage'> => ({
    ...storageMobileVault(options),
    create: async () => {
        const storage = nativeStoragePorts(options);
        onLoad(await loadNativeSession(storage, options.vault, options.appState));
        return storage;
    },
});
