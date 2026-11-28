import type {
    AckLogUploadQueuePayload,
    AckPendingReportsPayload,
    ApplyCustomZipPayload,
    ClearBootRecordsPayload,
    ClearLogUploadQueuePayload,
    ClearNativeCachePayload,
    ClearTestRecordsPayload,
    DisableCustomZipPayload,
    FetchAllTestRecordsPayload,
    FetchBootRecordsPayload,
    FetchCustomZipStatusPayload,
    FetchLogUploadQueuePayload,
    FetchNativeStorageSummaryPayload,
    FetchPendingReportsPayload,
    FetchTestRecordPayload,
    SaveAllTestRecordsPayload,
    SaveTestRecordPayload,
    SendBootMetricsPayload,
    SendLogPayload,
    SetDebugModePayload,
    StartPerfTracePayload,
    StopPerfTracePayload,
} from '../model';

export type DiagnosticsWebMessagePayloadMap = {
    FetchBootRecords: FetchBootRecordsPayload;
    ClearBootRecords: ClearBootRecordsPayload;
    ApplyCustomZip: ApplyCustomZipPayload;
    DisableCustomZip: DisableCustomZipPayload;
    FetchCustomZipStatus: FetchCustomZipStatusPayload;
    FetchNativeStorageSummary: FetchNativeStorageSummaryPayload;
    ClearNativeCache: ClearNativeCachePayload;
    SendLog: SendLogPayload;
    FetchLogUploadQueue: FetchLogUploadQueuePayload;
    AckLogUploadQueue: AckLogUploadQueuePayload;
    ClearLogUploadQueue: ClearLogUploadQueuePayload;
    FetchPendingReports: FetchPendingReportsPayload;
    AckPendingReports: AckPendingReportsPayload;
    SendBootMetrics: SendBootMetricsPayload;
    SetDebugMode: SetDebugModePayload;
    StartPerfTrace: StartPerfTracePayload;
    StopPerfTrace: StopPerfTracePayload;
    FetchTestRecord: FetchTestRecordPayload;
    FetchAllTestRecords: FetchAllTestRecordsPayload;
    SaveTestRecord: SaveTestRecordPayload;
    SaveAllTestRecords: SaveAllTestRecordsPayload;
    ClearTestRecords: ClearTestRecordsPayload;
};
