// src/types/model/native-storage.ts

/**
 * One group of what the native shell persists: an SQLite table, or one MMKV key.
 *
 * Exists for the debug panel's storage screen. Inside the app the web's own storage (localStorage,
 * IndexedDB) is only half of what is kept on the device — the chat cache and the invited-cloud list
 * live natively — and a page can measure only its own half, so the shell reports the other.
 */
export type NativeStorageEntry = {
    /** Table name, or the MMKV key itself. */
    name: string;
    /** Rows in the table; always 1 for an MMKV key. */
    count: number;
    /**
     * Approximate size in bytes: the summed length of every column's text form, or the length of the
     * key's stored string. Good for "which one is big", not for disk accounting.
     */
    bytes: number;
    /** The table does not exist — a failed migration never created it. */
    missing?: true;
    /** Set when this one exists but could not be read. */
    error?: string;
};

/** [Request] Inventory every native store. */
export type FetchNativeStorageSummaryPayload = {
    // Empty object type, reserved for future extension.
};

/** [Response] Each native store, entry by entry. */
export type OnFetchNativeStorageSummaryPayload = {
    /** Every cache table, including the ones `ClearNativeCache` keeps by default. */
    sqlite: NativeStorageEntry[];
    /** Every MMKV key — preferences, the shell's config lane, the log and report queues. */
    mmkv: NativeStorageEntry[];
    /** Tables the server cannot fill again; `ClearNativeCache` empties them only when asked to. */
    unrecoverableTables: string[];
    /**
     * Tables `ClearNativeCache` never empties. `invites` carries the dismissals of invite cards, which
     * only this device ever writes — the server refills the rows but not that stamp.
     */
    keptTables: string[];
};

/**
 * [Request] Empty the native SQLite cache.
 *
 * MMKV is not touched: it holds the shell's own settings and its unsent log and report queues, not a
 * copy of server data, so wiping it fixes no stale-cache bug and loses things nothing refills.
 */
export type ClearNativeCachePayload = {
    /**
     * Also empty the invited-cloud table. Off by default because the server has no list of invited
     * clouds to fetch again — once cleared, a cloud comes back only when a push happens to name it.
     */
    includeInvitedClouds: boolean;
};

/** [Response] Which tables were emptied, and which were left as they were (`keptTables` included). */
export type OnClearNativeCachePayload = {
    cleared: string[];
    kept: string[];
    /** Tables whose clear threw; they are neither in `cleared` nor in `kept`. */
    failed: string[];
};
