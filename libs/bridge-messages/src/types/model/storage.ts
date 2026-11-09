// --- Storage Types ---
//
// A storage medium the shell keeps for the web. The first is `nativeSecure`, the device vault: the
// iOS Keychain or Android Keystore on the phone, Electron `safeStorage` on the desktop. The web keeps
// a copy in memory and reads it synchronously; these messages fill that copy at boot and write it
// back.
//
// Only the main web — the phone's main WebView, the desktop's main window — is answered. A sub WebView
// page or another origin gets nothing.
//
// A shell that keeps a medium says so before the page runs: `window.CHATIC_APP_STORAGE_MEDIA` lists the
// media it keeps (`['nativeSecure']`). The web decides from that list alone.

/** The media a shell keeps for the web. */
export type StorageMedium = 'nativeSecure';

/** Why a medium cannot be used this run. */
export type StorageUnavailableReason = 'locked' | 'undecryptable' | 'error';

/**
 * [Request] Every value in the medium. The shell reads the vault when it starts, before the page;
 * a request that arrives before that read has finished waits for it.
 */
export type StorageGetPayload = {
    medium: StorageMedium;
};

/** [Response] The medium's values, or why it cannot be used this run. */
export type OnStorageGetPayload = {
    status: 'available' | 'unavailable';
    /** Set when `status` is `unavailable`. */
    reason?: StorageUnavailableReason;
    /**
     * The vault could not be decrypted — the device key was invalidated, or the data came from another
     * device — so the shell emptied it and starts over. The person signs in again.
     */
    reset?: true;
    /** Every key and value; `{}` when `unavailable`. */
    values: Record<string, string>;
};

/**
 * [Request] Writes to the medium, by key: `set` stores each value, `remove` drops each key. One request
 * carries every write the web made in one turn of its event loop.
 */
export type StorageSavePayload = {
    medium: StorageMedium;
    set: Record<string, string>;
    remove: string[];
};

/**
 * [Response] `ok` only once the writes are in the vault. `false` means they are not, and the shell
 * treats the medium as unavailable for the rest of the run.
 */
export type OnStorageSavePayload = {
    ok: boolean;
};

/** [Request] Empties the medium. */
export type StorageClearPayload = {
    medium: StorageMedium;
};

/** [Response] `ok` only once the vault is empty. */
export type OnStorageClearPayload = {
    ok: boolean;
};
