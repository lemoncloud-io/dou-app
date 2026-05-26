export interface TestRecord {
    key: string;
    value: string;
    updated_at: number;
}

export interface FetchTestRecordPayload {
    key: string;
}

export interface OnFetchTestRecordPayload {
    key: string;
    item: TestRecord | null;
}

export interface FetchAllTestRecordsPayload {
    keys?: string[];
}

export interface OnFetchAllTestRecordsPayload {
    items: TestRecord[];
}

export interface SaveTestRecordPayload {
    key: string;
    value: string;
}

export interface OnSaveTestRecordPayload {
    key: string;
    success: boolean;
}

export interface SaveAllTestRecordsPayload {
    items: Array<{ key: string; value: string }>;
}

export interface OnSaveAllTestRecordsPayload {
    success: boolean;
    count: number;
}

export interface ClearTestRecordsPayload {}

export interface OnClearTestRecordsPayload {
    success: boolean;
}
