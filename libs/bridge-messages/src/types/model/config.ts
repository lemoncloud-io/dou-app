export type SaveConfigValuePayload = {
    key: string;
    value: string;
};

export type ClearConfigValuePayload = {
    key: string;
};

export type OnSaveConfigValuePayload = {
    key: string;
    success: boolean;
};

export type OnClearConfigValuePayload = {
    key: string;
    success: boolean;
};
