import type { IConsoleLogger, ILogService } from './log';
import { ConsoleLogger, LogBufferService, LogService } from './log';
import type { IDeviceService } from './device';
import { DeviceService } from './device';
import type { IPermissionService } from './permission';
import { PermissionService } from './permission';
import type { INotificationService } from './notification';
import { NotificationService } from './notification';
import type { IOAuthService } from './oauth';
import { OAuthService } from './oauth';
import type { IDynamicAppIconService } from './dynamicAppIcon';
import { DynamicAppIconService } from './dynamicAppIcon';
import type { IFirebaseCrashlyticsService, IFirebaseInstallationService } from './firebase';
import { FirebaseCrashlyticsService, FirebaseInstallationService } from './firebase';
import type { ISubscriptionIapService } from './subscriptionIap';
import { SubscriptionIapService } from './subscriptionIap';
import type { IPreferenceService } from './preference';
import { PreferenceService } from './preference';
import type { ICacheCrudService, ICacheSearchService } from './cache';
import { CacheCrudService, CacheSearchService } from './cache';

import {
    ChannelDataSource,
    ChatDataSource,
    InviteCloudDataSource,
    JoinDataSource,
    MetaDataSource,
    SiteDataSource,
    UserDataSource,
} from '../data/cache';
import type { AppLogInfo } from '@chatic/app-messages';
import type { IKeyValueStorage, ISqliteDatabase } from '../database';
import { MmkvStorage, SqliteDatabase } from '../database';
import type { ILogBufferService } from './log/buffer';
import { createRingBuffer } from './log/utils/ringBuffer';

class DependencyProvider {
    private static instance: DependencyProvider;

    public readonly logService: ILogService;
    public readonly consoleLogger: IConsoleLogger;
    public readonly logBufferService: ILogBufferService;
    public readonly deviceService: IDeviceService;
    public readonly permissionService: IPermissionService;
    public readonly notificationService: INotificationService;
    public readonly oauthService: IOAuthService;
    public readonly dynamicAppIconService: IDynamicAppIconService;
    public readonly firebaseCrashlyticsService: IFirebaseCrashlyticsService;
    public readonly firebaseInstallationService: IFirebaseInstallationService;
    public readonly subscriptionIapService: ISubscriptionIapService;
    public readonly preferenceService: IPreferenceService;
    public readonly cacheCrudService: ICacheCrudService;
    public readonly cacheSearchService: ICacheSearchService;
    public readonly keyValueStorage: IKeyValueStorage;
    public readonly sqliteDatabase: ISqliteDatabase;

    private constructor() {
        this.logService = new LogService();
        this.consoleLogger = new ConsoleLogger(this.logService);
        this.keyValueStorage = new MmkvStorage(this.logService);

        // Inject dependencies into LogBufferService
        this.logBufferService = new LogBufferService(
            this.logService,
            this.keyValueStorage,
            createRingBuffer<AppLogInfo>(64)
        );

        this.sqliteDatabase = new SqliteDatabase(this.logService);
        this.deviceService = new DeviceService(this.logService);
        this.permissionService = new PermissionService(this.logService);
        this.notificationService = new NotificationService(this.logService);
        this.oauthService = new OAuthService(this.logService);
        this.dynamicAppIconService = new DynamicAppIconService(this.logService, this.keyValueStorage);
        this.firebaseCrashlyticsService = new FirebaseCrashlyticsService(this.logService);
        this.firebaseInstallationService = new FirebaseInstallationService(this.logService);
        this.subscriptionIapService = new SubscriptionIapService(this.logService);
        this.preferenceService = new PreferenceService(this.logService, this.keyValueStorage);

        // Data Sources
        const channelDataSource = new ChannelDataSource();
        const chatDataSource = new ChatDataSource();
        const joinDataSource = new JoinDataSource();
        const metaDataSource = new MetaDataSource();
        const siteDataSource = new SiteDataSource();
        const userDataSource = new UserDataSource();
        const inviteCloudDataSource = new InviteCloudDataSource();

        // Cache Services
        this.cacheCrudService = new CacheCrudService(
            this.logService,
            chatDataSource,
            channelDataSource,
            joinDataSource,
            siteDataSource,
            userDataSource,
            inviteCloudDataSource,
            metaDataSource
        );

        this.cacheSearchService = new CacheSearchService(
            this.logService,
            channelDataSource,
            chatDataSource,
            siteDataSource
        );

        // Initialize SQLite schemas
        void this.sqliteDatabase.initTables();

        // Initialize Logging
        this.consoleLogger.init();
        void this.logBufferService.init();

        // Initialize Crashlytics immediately
        this.firebaseCrashlyticsService.init();
        void this.firebaseCrashlyticsService.setupUser();
    }

    public static getInstance(): DependencyProvider {
        if (!DependencyProvider.instance) {
            DependencyProvider.instance = new DependencyProvider();
        }
        return DependencyProvider.instance;
    }
}

export const provider = DependencyProvider.getInstance();
