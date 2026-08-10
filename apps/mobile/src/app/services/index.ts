import { provider } from './provider';

export * from './provider';
export * from './device';
export * from './clipboard';
export * from './sms';
export * from './upload';
export * from './dynamicAppIcon';
export * from './notification';
export * from './log';
export * from './oauth';
export * from './permission';
export * from './firebase';
export * from './subscriptionIap';
export * from './preference';
export * from './version';
export * from './unfurl';
export * from './perf';
export * from './cache';
export * from '../database';
export * from './deeplinks/DeeplinkService';
export * from './deeplinks/DeepLinkManager';

// Commonly used services.
//
// SQLite-backed services (sqliteDatabase, cacheCrudService, cacheSearchService, uploadService,
// testRecordService) are intentionally NOT re-exported here: a module-level `export const x =
// provider.x` would invoke the lazy getter at barrel load — which happens during boot — and open
// SQLite on the pre-webview critical path. Access them via `provider.x` at the point of use so the
// database opens only when first needed (first web cache/upload message). See boot-optimization.md 4.4.
export const logger = provider.logService;
export const logBufferService = provider.logBufferService;
export const deviceService = provider.deviceService;
export const clipboardService = provider.clipboardService;
export const smsService = provider.smsService;
export const permissionService = provider.permissionService;
export const notificationService = provider.notificationService;
export const oAuthService = provider.oauthService;
export const dynamicAppIconService = provider.dynamicAppIconService;
export const firebaseCrashlyticsService = provider.firebaseCrashlyticsService;
export const firebaseInstallationService = provider.firebaseInstallationService;
export const subscriptionIapService = provider.subscriptionIapService;
export const preferenceService = provider.preferenceService;
export const versionService = provider.versionService;
export const unfurlService = provider.unfurlService;
export const keyValueStorage = provider.keyValueStorage;
export const pushEventManager = provider.pushEventManager;
export const deeplinkManager = provider.deeplinkManager;
export const deeplinkService = provider.deeplinkService;
export const bootMetricsService = provider.bootMetricsService;
