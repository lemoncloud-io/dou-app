export type CheckAppUpdatePayload = {};

export type OnCheckAppUpdatePayload = {
    platform: 'ios' | 'android';
    currentVersion: string;
    latestVersion: string;
    updateAvailable: boolean;
    storeUrl: string;
    forceUpdate?: boolean;
};

export type OpenStorePayload = {};

export type OnOpenStorePayload = {};
