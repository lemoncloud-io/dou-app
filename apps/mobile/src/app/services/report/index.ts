// NOTE: implementation modules (PendingReportQueueService, nativeErrorDetection)
// are intentionally NOT re-exported: they import react-native-mmkv / firebase,
// whose native side effects break jsdom test environments. Import them
// directly (provider does).
export * from './types';
