import type { ILogService } from './log';
import { LogService, LogUploadQueueService } from './log';
import { createConsoleListener, logHub } from '@chatic/logger';
// Deep path, per the barrel policy: this module imports react-native-mmkv.
import { MmkvLogUploadQueuePersistence } from './log/uploadQueue/persistence';
import { attachNativeLoggerBridge } from './log/native/nativeLoggerBridge';
import { attachNativeLogContext } from './log/native/nativeLogContext';
import type { IPendingReportQueueService } from './report';
import { PendingReportQueueService } from './report/PendingReportQueueService';
import { checkCrashOnPreviousExecution, installNativeErrorDetection } from './report/nativeErrorDetection';
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
import type { IVersionService } from './version';
import { VersionService } from './version';
import type { IUnfurlService } from './unfurl';
import { UnfurlService } from './unfurl';
import DeviceInfo from 'react-native-device-info';

import {
    ChannelDataSource,
    ChatDataSource,
    InviteCloudDataSource,
    InviteDataSource,
    JoinDataSource,
    SiteDataSource,
    UserDataSource,
    ProfileDataSource,
    MetaDataSource,
    TestRecordDataSource,
} from '../data/cache';
import { TestRecordService } from './cache/TestRecordService';
import type { IKeyValueStorage, ISqliteDatabase } from '../database';
import { MmkvStorage, SqliteDatabase, TABLES } from '../database';
import type { ILogUploadQueueService } from './log/uploadQueue/types';

class DependencyProvider {
    private static instance: DependencyProvider;

    // Eager — foundational or boot-critical (logging, storage, boot metrics, deep link / notification
    // cold-start capture, crash reporting). Constructed in the constructor.
    public readonly logService: ILogService;
    public readonly logUploadQueueService: ILogUploadQueueService;
    public readonly keyValueStorage: IKeyValueStorage;
    public readonly bootMetricsService: IBootMetricsService;
    public readonly notificationService: INotificationService;
    public readonly pushEventManager: IPushEventManager;
    public readonly deeplinkManager: DeepLinkManager;
    public readonly deeplinkService: IDeeplinkService;
    public readonly firebaseCrashlyticsService: IFirebaseCrashlyticsService;
    public readonly pendingReportQueueService: IPendingReportQueueService;

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
    private _versionService?: IVersionService;
    private _unfurlService?: IUnfurlService;
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
        invite: InviteDataSource;
        testRecord: TestRecordDataSource;
    };

    private constructor() {
        this.logService = new LogService();
        this.keyValueStorage = new MmkvStorage(this.logService);
        // Constructed first so its baseline sits as close to JS entry as possible.
        this.bootMetricsService = new BootMetricsService(
            this.logService,
            this.keyValueStorage,
            DeviceInfo.getVersion()
        );

        // The buffer itself lives in the core logger (merged native+web,
        // fixed capacity); this service only wires MMKV persistence to it.
        // The server-bound queue is a different store with a different lifetime
        // (ADR-0063): non-debug only, its own MMKV key, and nothing leaves it
        // before the web acks a successful upload. Constructed next to the buffer
        // because both must exist before the first dispatch.
        this.logUploadQueueService = new LogUploadQueueService(new MmkvLogUploadQueuePersistence(), __DEV__);

        // Deep link / notification services stay eager: cold-start capture reads them during the first
        // render (getInitialUrl / getInitialNotification), so they must exist before then.
        this.notificationService = new NotificationService(this.logService);
        this.pushEventManager = new PushEventManager(this.logService);
        this.deeplinkManager = new DeepLinkManager(this.logService);
        this.deeplinkService = new DeeplinkService(this.deeplinkManager, this.logService);
        this.firebaseCrashlyticsService = new FirebaseCrashlyticsService(this.logService);

        // Initialize Logging
        // Context first: it is stamped at dispatch, so anything logged before
        // this would carry no runId and be unattributable to this app run.
        attachNativeLogContext();
        // The hub's listeners, wired before anything logs (principle 15). The app
        // keeps three: the console, the store, and Crashlytics (below).
        //
        // Timestamps are on because relayed web entries arrive later than they
        // happened — the terminal's own arrival order would misread the merged
        // timeline, which is the reason to have one.
        if (__DEV__) logHub.subscribe(createConsoleListener({ timestamps: true }));
        this.logUploadQueueService.init();
        // Pure-native (Kotlin/Swift) logs join the same core buffer with
        // source:'native'; ready() flushes the native cold-start queue (ADR-0047).
        attachNativeLoggerBridge();

        // Initialize Crashlytics immediately — boot-window crash reporting takes priority over the
        // small synchronous cost, so it stays eager while other services became lazy (4.4).
        this.firebaseCrashlyticsService.init();
        void this.firebaseCrashlyticsService.setupUser();

        // ADR-0047: native-side error detection. Uncaught JS exceptions and
        // unhandled rejections queue deferred reports the web relays; the
        // relaunch check reads the previous run's last-log timestamp, restored
        // from MMKV by logUploadQueueService.init() above.
        this.pendingReportQueueService = new PendingReportQueueService();
        const detectionDeps = {
            logService: this.logService,
            logUploadQueue: this.logUploadQueueService,
            pendingReports: this.pendingReportQueueService,
        };
        installNativeErrorDetection(detectionDeps);
        void checkCrashOnPreviousExecution(detectionDeps);

        // Boot timeline: eager provider initialization done. Non-essential services (SQLite/cache/
        // upload, IAP, app icon, SMS, OAuth, clipboard, permission, preference, device, firebase
        // installation) are created lazily on first access — see boot-optimization.md 4.4.
        this.bootMetricsService.mark('provider-ready');
    }

    // --- Lazy service getters (created + memoized on first access, see boot-optimization.md 4.4) ---

    public get sqliteDatabase(): ISqliteDatabase {
        if (!this._sqliteDatabase) {
            // Schemas are initialized on first DB access (was eager in the constructor before 4.4).
            // SqliteDatabase itself gates every query on migrations completing, so no explicit
            // initTables() call or await is needed here.
            this._sqliteDatabase = new SqliteDatabase(this.logService);
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
                invite: new InviteDataSource(db, TABLES.INVITES),
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
                ds.meta,
                ds.invite
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

    public get versionService(): IVersionService {
        if (!this._versionService) {
            this._versionService = new VersionService(this.logService);
        }
        return this._versionService;
    }

    public get unfurlService(): IUnfurlService {
        if (!this._unfurlService) {
            this._unfurlService = new UnfurlService(this.logService);
        }
        return this._unfurlService;
    }

    public static getInstance(): DependencyProvider {
        if (!DependencyProvider.instance) {
            DependencyProvider.instance = new DependencyProvider();
        }
        return DependencyProvider.instance;
    }
}

export const provider = DependencyProvider.getInstance();
