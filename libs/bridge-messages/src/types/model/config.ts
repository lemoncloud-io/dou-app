// src/types/model/config.ts

/** [Request] Save a single key in the shell's general-purpose KV store as an opaque string. The shell doesn't know its meaning (ADR-0079, decision 9). */
export type SaveConfigValuePayload = {
    key: string;
    value: string;
};

/** [Request] Remove a single key from the shell's general-purpose KV store — clears the override. */
export type ClearConfigValuePayload = {
    key: string;
};

/** [Response] Save result. */
export type OnSaveConfigValuePayload = {
    key: string;
    success: boolean;
};

/** [Response] Delete result. */
export type OnClearConfigValuePayload = {
    key: string;
    success: boolean;
};
