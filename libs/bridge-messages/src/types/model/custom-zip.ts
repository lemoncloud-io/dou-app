export type ApplyCustomZipPayload = {
    url: string;
};

export type OnApplyCustomZipPayload = {
    success: boolean;
    serverUrl: string | null;
};

export type DisableCustomZipPayload = {};

export type OnDisableCustomZipPayload = {
    success: boolean;
};

export type FetchCustomZipStatusPayload = {};

export type OnFetchCustomZipStatusPayload = {
    allowed: boolean;
    localRoot: string | null;
    serverUrl: string | null;
};
