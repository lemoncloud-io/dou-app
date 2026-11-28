import type {
    OnAckLogUploadQueuePayload,
    OnAckPendingReportsPayload,
    OnApplyCustomZipPayload,
    OnClearBootRecordsPayload,
    OnClearLogUploadQueuePayload,
    OnClearNativeCachePayload,
    OnClearTestRecordsPayload,
    OnDisableCustomZipPayload,
    OnFetchAllTestRecordsPayload,
    OnFetchBootRecordsPayload,
    OnFetchCustomZipStatusPayload,
    OnFetchLogUploadQueuePayload,
    OnFetchNativeStorageSummaryPayload,
    OnFetchPendingReportsPayload,
    OnFetchTestRecordPayload,
    OnSaveAllTestRecordsPayload,
    OnSaveTestRecordPayload,
    OnSendBootMetricsPayload,
    OnSendLogPayload,
    OnSetDebugModePayload,
    OnStartPerfTracePayload,
    OnStopPerfTracePayload,
} from '../model';

export type DiagnosticsAppMessageDataMap = {
    OnFetchBootRecords: OnFetchBootRecordsPayload;
    OnClearBootRecords: OnClearBootRecordsPayload;
    OnApplyCustomZip: OnApplyCustomZipPayload;
    OnDisableCustomZip: OnDisableCustomZipPayload;
    OnFetchCustomZipStatus: OnFetchCustomZipStatusPayload;
    OnFetchNativeStorageSummary: OnFetchNativeStorageSummaryPayload;
    OnClearNativeCache: OnClearNativeCachePayload;
    OnSendLog: OnSendLogPayload;
    OnFetchLogUploadQueue: OnFetchLogUploadQueuePayload;
    OnAckLogUploadQueue: OnAckLogUploadQueuePayload;
    OnClearLogUploadQueue: OnClearLogUploadQueuePayload;
    OnFetchPendingReports: OnFetchPendingReportsPayload;
    OnAckPendingReports: OnAckPendingReportsPayload;
    OnSendBootMetrics: OnSendBootMetricsPayload;
    OnSetDebugMode: OnSetDebugModePayload;
    OnStartPerfTrace: OnStartPerfTracePayload;
    OnStopPerfTrace: OnStopPerfTracePayload;
    OnFetchTestRecord: OnFetchTestRecordPayload;
    OnFetchAllTestRecords: OnFetchAllTestRecordsPayload;
    OnSaveTestRecord: OnSaveTestRecordPayload;
    OnSaveAllTestRecords: OnSaveAllTestRecordsPayload;
    OnClearTestRecords: OnClearTestRecordsPayload;
};
