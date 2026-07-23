import {
    bootMetricsService,
    clipboardService,
    deviceService,
    smsService,
    dynamicAppIconService,
    firebaseCrashlyticsService,
    firebaseInstallationService,
    keyValueStorage,
    logBufferService,
    logger,
    notificationService,
    oAuthService,
    permissionService,
    preferenceService,
    subscriptionIapService,
} from '../services';

// SQLite-backed services (cacheCrudService, cacheSearchService, testRecordService, uploadService,
// sqliteDatabase) are deliberately not surfaced here — reading them constructs the database, and
// this hook runs during MainScreen render (before load-start). Consumers access `provider.x` inside
// their message callbacks so SQLite opens only on first use. See boot-optimization.md 4.4.
export const useServices = () => ({
    logService: logger,
    logBufferService: logBufferService,
    deviceService: deviceService,
    clipboardService: clipboardService,
    smsService: smsService,
    permissionService: permissionService,
    notificationService: notificationService,
    oauthService: oAuthService,
    dynamicAppIconService: dynamicAppIconService,
    crashlyticsService: firebaseCrashlyticsService,
    firebaseInstallationService: firebaseInstallationService,
    subscriptionIapService: subscriptionIapService,
    preferenceService: preferenceService,
    keyValueStorage: keyValueStorage,
    bootMetricsService: bootMetricsService,
});
