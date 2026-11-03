export type TestRecord = {
    key: string;
    value: string;
    updated_at: number;
};

export type FetchTestRecordPayload = {
    key: string;
};

export type OnFetchTestRecordPayload = {
    key: string;
    item: TestRecord | null;
};

export type FetchAllTestRecordsPayload = {
    keys?: string[];
};

export type OnFetchAllTestRecordsPayload = {
    items: TestRecord[];
};

export type SaveTestRecordPayload = {
    key: string;
    value: string;
};

export type OnSaveTestRecordPayload = {
    key: string;
    success: boolean;
};

export type SaveAllTestRecordsPayload = {
    items: Array<{ key: string; value: string }>;
};

export type OnSaveAllTestRecordsPayload = {
    success: boolean;
    count: number;
};

export type ClearTestRecordsPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

export type OnClearTestRecordsPayload = {
    success: boolean;
};
