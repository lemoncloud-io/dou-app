export type NativeStorageEntry = {
    name: string;
    count: number;
    bytes: number;
    missing?: true;
    error?: string;
};

export type FetchNativeStorageSummaryPayload = {};

export type OnFetchNativeStorageSummaryPayload = {
    sqlite: NativeStorageEntry[];
    mmkv: NativeStorageEntry[];
    unrecoverableTables: string[];
    keptTables: string[];
};

export type ClearNativeCachePayload = {
    includeInvitedClouds: boolean;
};

export type OnClearNativeCachePayload = {
    cleared: string[];
    kept: string[];
    failed: string[];
};
