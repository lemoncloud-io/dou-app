/**
 * App Message:
 * message from App to Web
 */
import type {
    AppLogInfo,
    AppPermissionType,
    CacheType,
    ContactInfo,
    DeviceInfo,
    DocumentInfo,
    FcmTokenInfo,
    MediaAsset,
    NotificationInfo,
    OAuthTokenResult,
    PermissionStatus,
    ProductSubscriptionInfo,
    PurchaseInfo,
    SafeAreaInfo,
    ShareInfo,
    VersionInfo,
} from './common';
import type { ClientMessage } from './client-message';
import type { ChannelView, JoinView, UserView } from '@lemoncloud/chatic-socials-api';

export const AppMessageTypes = {
    OnSuccessSyncCredential: 'OnSuccessSyncCredential',
    OnUpdateDeviceInfo: 'OnUpdateDeviceInfo',
    OnCloseModal: 'OnCloseModal',
    OnOpenShareSheet: 'OnOpenShareSheet',
    OnOpenDocument: 'OnOpenDocument',
    OnGetContacts: 'OnGetContacts',
    OnOpenCamera: 'OnOpenCamera',
    OnOpenPhotoLibrary: 'OnOpenPhotoLibrary',
    OnFetchSafeArea: 'OnFetchSafeArea',
    OnFetchFcmToken: 'OnFetchFcmToken',
    OnAppLog: 'OnAppLog',
    OnReceiveNotification: 'OnReceiveNotification',
    OnOpenNotification: 'OnOpenNotification',
    OnSuccessPurchase: 'OnSuccessPurchase',
    OnFetchProductSubscriptions: 'OnFetchProductSubscriptions',
    OnFetchPurchases: 'OnFetchPurchases',
    OnFetchAllCacheData: 'OnFetchAllCacheData',
    OnFetchCacheData: 'OnFetchCacheData',
    OnSaveCacheData: 'OnSaveCacheData',
    OnRequestPermission: 'OnRequestPermission',
    OnSetWsEndpoint: 'OnSetWsEndpoint',
    OnOAuthLogin: 'OnOAuthLogin',
    OnOAuthLogout: 'OnOAuthLogout',
} as const;
export type AppMessageType = (typeof AppMessageTypes)[keyof typeof AppMessageTypes];

interface DefaultMessage<T extends AppMessageType> {
    type: T;
}

export interface OnUpdateDeviceInfo extends DefaultMessage<'OnUpdateDeviceInfo'> {
    data: DeviceInfo & VersionInfo;
}

export interface OnOpenShareSheet extends DefaultMessage<'OnOpenShareSheet'> {
    data: ShareInfo;
}

export interface OnOpenDocument extends DefaultMessage<'OnOpenDocument'> {
    data: {
        documents: DocumentInfo[];
    };
}

export interface OnGetContacts extends DefaultMessage<'OnGetContacts'> {
    data: {
        contacts: ContactInfo[];
    };
}

export interface OnOpenCamera extends DefaultMessage<'OnOpenCamera'> {
    data: {
        assets: MediaAsset[];
    };
}

export interface OnOpenPhotoLibrary extends DefaultMessage<'OnOpenPhotoLibrary'> {
    data: {
        assets: MediaAsset[];
    };
}

export interface OnFetchSafeArea extends DefaultMessage<'OnFetchSafeArea'> {
    data: SafeAreaInfo;
}

export interface OnFetchFcmToken extends DefaultMessage<'OnFetchFcmToken'> {
    data: FcmTokenInfo;
}

export interface OnAppLog extends DefaultMessage<'OnAppLog'> {
    data: AppLogInfo;
}

export interface OnReceiveNotification extends DefaultMessage<'OnReceiveNotification'> {
    data: NotificationInfo;
}

export interface OnOpenNotification extends DefaultMessage<'OnOpenNotification'> {
    data: NotificationInfo;
}

export interface OnFetchProductSubscriptions extends DefaultMessage<'OnFetchProductSubscriptions'> {
    data: ProductSubscriptionInfo;
}

export interface OnFetchPurchases extends DefaultMessage<'OnFetchPurchases'> {
    data: PurchaseInfo;
}

export interface OnFetchAllCacheData extends DefaultMessage<'OnFetchAllCacheData'> {
    data: {
        type: CacheType;
        channelId?: string;
        items: (ChannelView | ClientMessage | UserView | JoinView)[];
    };
}

export interface OnFetchCacheData extends DefaultMessage<'OnFetchCacheData'> {
    data: {
        type: CacheType;
        id: string;
        item: ChannelView | ClientMessage | UserView | JoinView | null;
    };
}

export interface OnSaveCacheData extends DefaultMessage<'OnSaveCacheData'> {
    data: {
        type: CacheType;
        id: string;
    };
}

export interface OnSetWsEndpoint extends DefaultMessage<'OnSetWsEndpoint'> {
    data: { wss: string };
}

export interface OnRequestPermission extends DefaultMessage<'OnRequestPermission'> {
    data: {
        permission: AppPermissionType;
        status: PermissionStatus;
    };
}

export interface OnOAuthLogin extends DefaultMessage<'OnOAuthLogin'> {
    data: {
        result: OAuthTokenResult | null;
    };
}

export interface OnOAuthLogout extends DefaultMessage<'OnOAuthLogout'> {
    data: {
        success: boolean;
    };
}

export interface AppMessageMap {
    /**
     * TODO: Not Implement
     * @author dev@example.com
     */
    OnSuccessSyncCredential: DefaultMessage<'OnSuccessSyncCredential'>;
    OnUpdateDeviceInfo: OnUpdateDeviceInfo;

    /**
     * Control Device Event
     */
    OnCloseModal: DefaultMessage<'OnCloseModal'>;
    OnOpenShareSheet: OnOpenShareSheet;
    OnOpenDocument: OnOpenDocument;
    OnGetContacts: OnGetContacts;
    OnOpenCamera: OnOpenCamera;
    OnOpenPhotoLibrary: OnOpenPhotoLibrary;
    OnRequestPermission: OnRequestPermission;

    /**
     * Device Info Event
     */
    OnFetchSafeArea: OnFetchSafeArea;

    /**
     * Notification Event
     */
    OnFetchFcmToken: OnFetchFcmToken;
    OnReceiveNotification: OnReceiveNotification;
    OnOpenNotification: OnOpenNotification;

    /**
     * Common Event
     */
    OnAppLog: OnAppLog;

    /**
     * IAP Event
     */
    OnFetchProductSubscriptions: OnFetchProductSubscriptions;
    OnFetchPurchases: OnFetchPurchases;
    OnSuccessPurchase: DefaultMessage<'OnSuccessPurchase'>;

    /**
     * Cache Event
     */
    OnFetchAllCacheData: OnFetchAllCacheData;
    OnFetchCacheData: OnFetchCacheData;
    OnSaveCacheData: OnSaveCacheData;
    OnSetWsEndpoint: OnSetWsEndpoint;

    /**
     * OAuth Event
     */
    OnOAuthLogin: OnOAuthLogin;
    OnOAuthLogout: OnOAuthLogout;
}

export type AppMessageData<T extends AppMessageType> = AppMessageMap[T];
export type AppMessage = AppMessageData<AppMessageType>;
