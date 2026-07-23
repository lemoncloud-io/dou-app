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
import type { IBootMetricsService } from './perf';
import { BootMetricsService } from './perf';
import DeviceInfo from 'react-native-device-info';

import {
    ChannelDataSource,
    ChatDataSource,
    InviteCloudDataSource,
    JoinDataSource,
    SiteDataSource,
    UserDataSource,
    ProfileDataSource,
    MetaDataSource,
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

    // Eager — foundational or boot-critical (logging, storage, boot metrics, deep link / notification
    // cold-start capture, crash reporting). Constructed in the constructor.
    public readonly logService: ILogService;
    public readonly consoleLogger: IConsoleLogger;
    public readonly logBufferService: ILogBufferService;
    public readonly keyValueStorage: IKeyValueStorage;
    public readonly bootMetricsService: IBootMetricsService;
    public readonly notificationService: INotificationService;
    public readonly pushEventManager: IPushEventManager;
    public readonly deeplinkManager: DeepLinkManager;
    public readonly deeplinkService: IDeeplinkService;
    public readonly firebaseCrashlyticsService: IFirebaseCrashlyticsService;

    // Lazy — created on first access via getters to keep them off the boot critical path (see
    // boot-optimization.md 4.4). Backing fields are memoized after first construction.
    private _sqliteDatabase?: ISqliteDatabase;
    private _deviceService?: IDeviceService;
    private _clipboardService?: IClipboardService;
    private _smsService?: ISmsService;
    private _permissionService?: IPermissionService;
    private _oauthService?: IOAuthService;
    private _dynamicAppIconService?: IDynamicAppIconService;
    private _firebaseInstallationService?: IFirebaseInstallationService;
    private _subscriptionIapService?: ISubscriptionIapService;
    private _preferenceService?: IPreferenceService;
    private _uploadService?: IUploadService;
    private _cacheCrudService?: ICacheCrudService;
    private _cacheSearchService?: ICacheSearchService;
    private _testRecordService?: TestRecordService;
    private _dataSources?: {
        upload: SqliteUploadTaskDataSource;
        channel: ChannelDataSource;
        chat: ChatDataSource;
        join: JoinDataSource;
        site: SiteDataSource;
        user: UserDataSource;
        inviteCloud: InviteCloudDataSource;
        profile: ProfileDataSource;
        meta: MetaDataSource;
        testRecord: TestRecordDataSource;
    };

    private constructor() {
        this.logService = new LogService();
        this.consoleLogger = new ConsoleLogger(this.logService);
        this.keyValueStorage = new MmkvStorage(this.logService);
        // Constructed first so its baseline sits as close to JS entry as possible.
        this.bootMetricsService = new BootMetricsService(
            this.logService,
            this.keyValueStorage,
            DeviceInfo.getVersion()
        );

        // Inject dependencies into LogBufferService
        this.logBufferService = new LogBufferService(
            this.logService,
            this.keyValueStorage,
            createRingBuffer<AppLogInfo>(64)
        );

        // Deep link / notification services stay eager: cold-start capture reads them during the first
        // render (getInitialUrl / getInitialNotification), so they must exist before then.
        this.notificationService = new NotificationService(this.logService);
        this.pushEventManager = new PushEventManager(this.logService);
        this.deeplinkManager = new DeepLinkManager(this.logService);
        this.deeplinkService = new DeeplinkService(this.deeplinkManager, this.logService);
        this.firebaseCrashlyticsService = new FirebaseCrashlyticsService(this.logService);

        // Initialize Logging
        this.consoleLogger.init();
        void this.logBufferService.init();

        // Initialize Crashlytics immediately — boot-window crash reporting takes priority over the
        // small synchronous cost, so it stays eager while other services became lazy (4.4).
        this.firebaseCrashlyticsService.init();
        void this.firebaseCrashlyticsService.setupUser();

        // Boot timeline: eager provider initialization done. Non-essential services (SQLite/cache/
        // upload, IAP, app icon, SMS, OAuth, clipboard, permission, preference, device, firebase
        // installation) are created lazily on first access — see boot-optimization.md 4.4.
        this.bootMetricsService.mark('provider-ready');
    }

    // --- Lazy service getters (created + memoized on first access, see boot-optimization.md 4.4) ---

    public get sqliteDatabase(): ISqliteDatabase {
        if (!this._sqliteDatabase) {
            const db = new SqliteDatabase(this.logService);
            // Schemas are initialized on first DB access (was eager in the constructor before 4.4).
            void db.initTables();
            this._sqliteDatabase = db;
        }
        return this._sqliteDatabase;
    }

    /** Memoized SQLite-backed data sources shared by the cache/upload/test-record services. */
    private get dataSources() {
        if (!this._dataSources) {
            const db = this.sqliteDatabase;
            this._dataSources = {
                upload: new SqliteUploadTaskDataSource(db, this.logService),
                channel: new ChannelDataSource(db, TABLES.CHANNELS),
                chat: new ChatDataSource(db, TABLES.CHATS),
                join: new JoinDataSource(db, TABLES.JOINS),
                site: new SiteDataSource(db, TABLES.SITES),
                user: new UserDataSource(db, TABLES.USERS),
                inviteCloud: new InviteCloudDataSource(db, TABLES.INVITE_CLOUDS),
                profile: new ProfileDataSource(db, TABLES.PROFILES),
                meta: new MetaDataSource(db, TABLES.METAS),
                testRecord: new TestRecordDataSource(db, TABLES.TEST_RECORDS),
            };
        }
        return this._dataSources;
    }

    public get cacheCrudService(): ICacheCrudService {
        if (!this._cacheCrudService) {
            const ds = this.dataSources;
            this._cacheCrudService = new CacheCrudService(
                this.logService,
                ds.chat,
                ds.channel,
                ds.join,
                ds.site,
                ds.user,
                ds.inviteCloud,
                ds.profile,
                ds.meta
            );
        }
        return this._cacheCrudService;
    }

    public get cacheSearchService(): ICacheSearchService {
        if (!this._cacheSearchService) {
            const ds = this.dataSources;
            this._cacheSearchService = new CacheSearchService(this.logService, ds.channel, ds.chat, ds.site);
        }
        return this._cacheSearchService;
    }

    public get uploadService(): IUploadService {
        if (!this._uploadService) {
            this._uploadService = new UploadService(this.logService, this.dataSources.upload);
        }
        return this._uploadService;
    }

    public get testRecordService(): TestRecordService {
        if (!this._testRecordService) {
            this._testRecordService = new TestRecordService(this.logService, this.dataSources.testRecord);
        }
        return this._testRecordService;
    }

    public get deviceService(): IDeviceService {
        if (!this._deviceService) this._deviceService = new DeviceService(this.logService);
        return this._deviceService;
    }

    public get clipboardService(): IClipboardService {
        if (!this._clipboardService) this._clipboardService = new ClipboardService(this.logService);
        return this._clipboardService;
    }

    public get smsService(): ISmsService {
        if (!this._smsService) this._smsService = new SmsService(this.logService);
        return this._smsService;
    }

    public get permissionService(): IPermissionService {
        if (!this._permissionService) this._permissionService = new PermissionService(this.logService);
        return this._permissionService;
    }

    public get oauthService(): IOAuthService {
        if (!this._oauthService) this._oauthService = new OAuthService(this.logService);
        return this._oauthService;
    }

    public get dynamicAppIconService(): IDynamicAppIconService {
        if (!this._dynamicAppIconService) {
            this._dynamicAppIconService = new DynamicAppIconService(this.logService, this.keyValueStorage);
        }
        return this._dynamicAppIconService;
    }

    public get firebaseInstallationService(): IFirebaseInstallationService {
        if (!this._firebaseInstallationService) {
            this._firebaseInstallationService = new FirebaseInstallationService(this.logService);
        }
        return this._firebaseInstallationService;
    }

    public get subscriptionIapService(): ISubscriptionIapService {
        if (!this._subscriptionIapService) {
            this._subscriptionIapService = new SubscriptionIapService(this.logService);
        }
        return this._subscriptionIapService;
    }

    public get preferenceService(): IPreferenceService {
        if (!this._preferenceService) {
            this._preferenceService = new PreferenceService(this.logService, this.keyValueStorage);
        }
        return this._preferenceService;
    }

    public static getInstance(): DependencyProvider {
        if (!DependencyProvider.instance) {
            DependencyProvider.instance = new DependencyProvider();
        }
        return DependencyProvider.instance;
    }
}

export const provider = DependencyProvider.getInstance();
