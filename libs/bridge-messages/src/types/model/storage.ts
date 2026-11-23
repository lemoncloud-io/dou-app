export type StorageMedium = 'nativeSecure';

export type StorageUnavailableReason = 'locked' | 'undecryptable' | 'error';

export type StorageGetPayload = {
    medium: StorageMedium;
};

export type OnStorageGetPayload = {
    status: 'available' | 'unavailable';
    reason?: StorageUnavailableReason;
    reset?: true;
    values: Record<string, string>;
};

export type StorageSavePayload = {
    medium: StorageMedium;
    set: Record<string, string>;
    remove: string[];
};

export type OnStorageSavePayload = {
    ok: boolean;
};

export type StorageClearPayload = {
    medium: StorageMedium;
};

export type OnStorageClearPayload = {
    ok: boolean;
};
