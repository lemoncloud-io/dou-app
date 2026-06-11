import type { IConsoleLogger, ILogService } from './log';
import { ConsoleLogger, LogBufferService, LogService } from './log';
import type { IDeviceService } from './device';
import { DeviceService } from './device';
import type { IClipboardService } from './clipboard';
import { ClipboardService } from './clipboard';
import type { IPermissionService } from './permission';
import { PermissionService } from './permission';
import type { INotificationService, IPushEventManager } from './notification';
import { NotificationService } from './notification';
import { PushEventManager } from './notification/PushEventManager';
import { DeepLinkManager } from './deeplinks/DeepLinkManager';
import type { IDeeplinkService } from './deeplinks/DeeplinkService';
import { DeeplinkService } from './deeplinks/DeeplinkService';
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
import type { ISmsService } from './sms';
import { SmsService } from './sms';
import type { IUploadService } from './upload';
import { SqliteUploadTaskDataSource, UploadService } from './upload';

import {
    ChannelDataSource,
    ChatDataSource,
    InviteCloudDataSource,
    JoinDataSource,
    SiteDataSource,
    UserDataSource,
    TestRecordDataSource,
} from '../data/cache';
import { TestRecordService } from './cache/TestRecordService';
import type { AppLogInfo } from '@chatic/app-messages';
import type { IKeyValueStorage, ISqliteDatabase } from '../database';
import { MmkvStorage, SqliteDatabase, TABLES } from '../database';
import type { ILogBufferService } from './log/buffer';
import { createRingBuffer } from './log/utils/ringBuffer';

class DependencyProvider {
    private static instance: DependencyProvider;

    public readonly logService: ILogService;
    public readonly consoleLogger: IConsoleLogger;
    public readonly logBufferService: ILogBufferService;
    public readonly deviceService: IDeviceService;
    public readonly clipboardService: IClipboardService;
    public readonly smsService: ISmsService;
    public readonly uploadService: IUploadService;
    public readonly permissionService: IPermissionService;
    public readonly notificationService: INotificationService;
    public readonly pushEventManager: IPushEventManager;
    public readonly deeplinkManager: DeepLinkManager;
    public readonly deeplinkService: IDeeplinkService;
    public readonly oauthService: IOAuthService;
    public readonly dynamicAppIconService: IDynamicAppIconService;
    public readonly firebaseCrashlyticsService: IFirebaseCrashlyticsService;
    public readonly firebaseInstallationService: IFirebaseInstallationService;
    public readonly subscriptionIapService: ISubscriptionIapService;
    public readonly preferenceService: IPreferenceService;
    public readonly cacheCrudService: ICacheCrudService;
    public readonly cacheSearchService: ICacheSearchService;
    public readonly testRecordService: TestRecordService;
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
        this.clipboardService = new ClipboardService(this.logService);
        this.smsService = new SmsService(this.logService);
        this.permissionService = new PermissionService(this.logService);
        this.notificationService = new NotificationService(this.logService);
        this.oauthService = new OAuthService(this.logService);
        this.dynamicAppIconService = new DynamicAppIconService(this.logService, this.keyValueStorage);
        this.firebaseCrashlyticsService = new FirebaseCrashlyticsService(this.logService);
        this.firebaseInstallationService = new FirebaseInstallationService(this.logService);
        this.subscriptionIapService = new SubscriptionIapService(this.logService);
        this.preferenceService = new PreferenceService(this.logService, this.keyValueStorage);

        // Data Sources
        const uploadTaskDataSource = new SqliteUploadTaskDataSource(this.sqliteDatabase, this.logService);
        const channelDataSource = new ChannelDataSource(this.sqliteDatabase, TABLES.CHANNELS);
        const chatDataSource = new ChatDataSource(this.sqliteDatabase, TABLES.CHATS);
        const joinDataSource = new JoinDataSource(this.sqliteDatabase, TABLES.JOINS);
        const siteDataSource = new SiteDataSource(this.sqliteDatabase, TABLES.SITES);
        const userDataSource = new UserDataSource(this.sqliteDatabase, TABLES.USERS);
        const inviteCloudDataSource = new InviteCloudDataSource(this.sqliteDatabase, TABLES.INVITE_CLOUDS);

        // Cache Services
        this.cacheCrudService = new CacheCrudService(
            this.logService,
            chatDataSource,
            channelDataSource,
            joinDataSource,
            siteDataSource,
            userDataSource,
            inviteCloudDataSource
        );
        this.uploadService = new UploadService(this.logService, uploadTaskDataSource);
        this.pushEventManager = new PushEventManager(this.logService);
        this.deeplinkManager = new DeepLinkManager(this.logService);
        this.deeplinkService = new DeeplinkService(this.deeplinkManager, this.logService);

        this.cacheSearchService = new CacheSearchService(
            this.logService,
            channelDataSource,
            chatDataSource,
            siteDataSource
        );

        // Test Record Service
        const testRecordDataSource = new TestRecordDataSource(this.sqliteDatabase, TABLES.TEST_RECORDS);
        this.testRecordService = new TestRecordService(this.logService, testRecordDataSource);

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
