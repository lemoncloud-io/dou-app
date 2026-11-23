import type { ILogService } from './log';
import { LogService, LogUploadQueueService } from './log';
import { createConsoleListener, logHub } from '@chatic/logger';
import {
    FanOutPerfTraceBackend,
    PipelinePerfTraceBackend,
    SESSION_OWNER_ATTRIBUTE,
    configurePerfTraces,
} from '@chatic/perf';
import { MmkvLogUploadQueuePersistence } from './log/uploadQueue/persistence';
import { attachNativeLoggerBridge } from './log/native/nativeLoggerBridge';
import { attachNativeLogContext, readNativeLogContext, setLogSessionOwnerSource } from './log/native/nativeLogContext';
import { launchSessionOwner, settledSessionOwner } from './runtime/launchSessionOwner';
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
import type { IBootSplashService } from './bootSplash';
import { BootSplashService } from './bootSplash';
import { BootSplashBridge } from '../bridge/BootSplashBridge';
import type { IFirebaseCrashlyticsService, IFirebaseInstallationService } from './firebase';
import { FirebaseCrashlyticsService, FirebaseInstallationService, FirebasePerfTraceBackend } from './firebase';
import type { ISubscriptionIapService } from './subscriptionIap';
import { SubscriptionIapService } from './subscriptionIap';
import type { IConfigKvService } from './config';
import { ConfigKvService } from './config';
import type { IPreferenceService } from './preference';
import { PreferenceService } from './preference';
import type { ICacheCrudService, ICacheSearchService } from './cache';
import { CacheCrudService, CacheSearchService } from './cache';
import type { ISmsService } from './sms';
import { SmsService } from './sms';
import type { IBootMetricsService } from './perf';
import { BootMetricsService, createNativeTelemetryRecorder } from './perf';
import type { IVersionService } from './version';
import { VersionService } from './version';
import type { IUnfurlService } from './unfurl';
import { UnfurlService } from './unfurl';
import type { ISubWebViewService, SubWebViewManifestStore } from './subWebView';
import { createSubWebViewManifestStore, SubWebViewService } from './subWebView';
import DeviceInfo from 'react-native-device-info';
import type { ISecureStorageService } from './secureStorage';
import { SecureStorageService } from './secureStorage/SecureStorageService';
import { MmkvSecureStorageInstallFlag } from './secureStorage/MmkvSecureStorageInstallFlag';

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
import type { INativeStorageService } from './storage';
import { NativeStorageService } from './storage';
import type { IKeyValueStorage, ISqliteDatabase } from '../database';
import { MmkvStorage, SqliteDatabase, TABLES } from '../database';
import type { ILogUploadQueueService } from './log/uploadQueue/types';

class DependencyProvider {
    private static instance: DependencyProvider;

    public readonly logService: ILogService;
    public readonly logUploadQueueService: ILogUploadQueueService;
    public readonly keyValueStorage: IKeyValueStorage;
    public readonly bootMetricsService: IBootMetricsService;
    public readonly perfTraceBackend: FirebasePerfTraceBackend;
    public readonly notificationService: INotificationService;
    public readonly pushEventManager: IPushEventManager;
    public readonly deeplinkManager: DeepLinkManager;
    public readonly deeplinkService: IDeeplinkService;
    public readonly firebaseCrashlyticsService: IFirebaseCrashlyticsService;
    public readonly bootSplashService: IBootSplashService;
    public readonly pendingReportQueueService: IPendingReportQueueService;
    public readonly secureStorageService: ISecureStorageService;

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
    private _configKvService?: IConfigKvService;
    private _versionService?: IVersionService;
    private _unfurlService?: IUnfurlService;
    private _subWebViewService?: ISubWebViewService;
    private _subWebViewManifestStore?: SubWebViewManifestStore;
    private _cacheCrudService?: ICacheCrudService;
    private _cacheSearchService?: ICacheSearchService;
    private _testRecordService?: TestRecordService;
    private _nativeStorageService?: INativeStorageService;
    private _dataSources?: {
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
        this.perfTraceBackend = new FirebasePerfTraceBackend();
        const nativeTelemetryRecorder = createNativeTelemetryRecorder({ context: readNativeLogContext });
        configurePerfTraces(
            new FanOutPerfTraceBackend([
                this.perfTraceBackend,
                new PipelinePerfTraceBackend(
                    () => nativeTelemetryRecorder,
                    () => ({ [SESSION_OWNER_ATTRIBUTE]: settledSessionOwner() })
                ),
            ])
        );
        this.bootMetricsService = new BootMetricsService(
            this.logService,
            this.keyValueStorage,
            DeviceInfo.getVersion()
        );

        this.logUploadQueueService = new LogUploadQueueService(new MmkvLogUploadQueuePersistence(), __DEV__);

        this.bootSplashService = new BootSplashService(this.logService, BootSplashBridge);
        this.bootSplashService.subscribe(reason => this.bootMetricsService.recordReveal(reason));
        this.notificationService = new NotificationService(this.logService, () =>
            this.bootSplashService.whenRevealed()
        );
        this.pushEventManager = new PushEventManager(this.logService);
        this.deeplinkManager = new DeepLinkManager(this.logService);
        this.deeplinkService = new DeeplinkService(this.deeplinkManager, this.logService);
        this.firebaseCrashlyticsService = new FirebaseCrashlyticsService(this.logService);
        this.secureStorageService = new SecureStorageService(
            this.logService,
            new MmkvSecureStorageInstallFlag(),
            DeviceInfo.getBundleId()
        );

        attachNativeLogContext();
        setLogSessionOwnerSource(launchSessionOwner);
        if (__DEV__) logHub.subscribe(createConsoleListener({ timestamps: true }));
        this.logUploadQueueService.init();
        attachNativeLoggerBridge();

        this.secureStorageService.start();

        this.firebaseCrashlyticsService.init();
        void this.firebaseCrashlyticsService.setupUser();

        this.pendingReportQueueService = new PendingReportQueueService();
        const detectionDeps = {
            logService: this.logService,
            logUploadQueue: this.logUploadQueueService,
            pendingReports: this.pendingReportQueueService,
        };
        installNativeErrorDetection(detectionDeps);
        void checkCrashOnPreviousExecution(detectionDeps);

        this.bootMetricsService.mark('provider-ready');
    }

    public get sqliteDatabase(): ISqliteDatabase {
        if (!this._sqliteDatabase) {
            this._sqliteDatabase = new SqliteDatabase(this.logService);
        }
        return this._sqliteDatabase;
    }

    private get dataSources() {
        if (!this._dataSources) {
            const db = this.sqliteDatabase;
            this._dataSources = {
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

    public get testRecordService(): TestRecordService {
        if (!this._testRecordService) {
            this._testRecordService = new TestRecordService(this.logService, this.dataSources.testRecord);
        }
        return this._testRecordService;
    }

    public get nativeStorageService(): INativeStorageService {
        if (!this._nativeStorageService) {
            this._nativeStorageService = new NativeStorageService(
                this.logService,
                this.sqliteDatabase,
                this.keyValueStorage,
                () => this.secureStorageService.keyCount()
            );
        }
        return this._nativeStorageService;
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

    public get configKvService(): IConfigKvService {
        if (!this._configKvService) {
            this._configKvService = new ConfigKvService(this.logService, this.keyValueStorage);
        }
        return this._configKvService;
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

    public get subWebViewService(): ISubWebViewService {
        if (!this._subWebViewService) this._subWebViewService = new SubWebViewService(this.logService);
        return this._subWebViewService;
    }

    public get subWebViewManifestStore(): SubWebViewManifestStore {
        if (!this._subWebViewManifestStore) {
            this._subWebViewManifestStore = createSubWebViewManifestStore({
                fetch: (url, init) => fetch(url, { ...init, credentials: 'omit', cache: 'no-store' }),
                logger: this.logService,
            });
        }
        return this._subWebViewManifestStore;
    }

    public static getInstance(): DependencyProvider {
        if (!DependencyProvider.instance) {
            DependencyProvider.instance = new DependencyProvider();
        }
        return DependencyProvider.instance;
    }
}

export const provider = DependencyProvider.getInstance();
