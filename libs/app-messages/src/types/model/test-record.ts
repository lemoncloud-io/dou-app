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
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};

export type OnClearTestRecordsPayload = {
    success: boolean;
};
