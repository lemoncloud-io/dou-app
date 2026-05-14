import { provider } from '../services';

export const useLogService = () => provider.logService;
export const useLogBufferService = () => provider.logBufferService;
export const useDeviceService = () => provider.deviceService;
export const usePermissionService = () => provider.permissionService;
export const useNotificationService = () => provider.notificationService;
export const useOAuthService = () => provider.oauthService;
export const useDynamicAppIconService = () => provider.dynamicAppIconService;
export const useCrashlyticsService = () => provider.firebaseCrashlyticsService;
export const useFirebaseInstallationService = () => provider.firebaseInstallationService;
export const useSubscriptionIapService = () => provider.subscriptionIapService;
export const usePreferenceService = () => provider.preferenceService;
export const useCacheCrudService = () => provider.cacheCrudService;
export const useCacheSearchService = () => provider.cacheSearchService;
export const useKeyValueStorage = () => provider.keyValueStorage;
export const useSqliteDatabase = () => provider.sqliteDatabase;

export const useServices = () => ({
    logService: provider.logService,
    logBufferService: provider.logBufferService,
    deviceService: provider.deviceService,
    permissionService: provider.permissionService,
    notificationService: provider.notificationService,
    oauthService: provider.oauthService,
    dynamicAppIconService: provider.dynamicAppIconService,
    crashlyticsService: provider.firebaseCrashlyticsService,
    firebaseInstallationService: provider.firebaseInstallationService,
    subscriptionIapService: provider.subscriptionIapService,
    preferenceService: provider.preferenceService,
    cacheCrudService: provider.cacheCrudService,
    cacheSearchService: provider.cacheSearchService,
    keyValueStorage: provider.keyValueStorage,
    sqliteDatabase: provider.sqliteDatabase,
});
