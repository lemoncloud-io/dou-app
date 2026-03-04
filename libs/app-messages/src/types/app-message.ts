/**
 * App Message:
 * message from App to Web
 */
import type {
    AppLogInfo,
    CacheType,
    DeviceInfo,
    FcmTokenInfo,
    NotificationInfo,
    ProductSubscriptionInfo,
    PurchaseInfo,
    SafeAreaInfo,
    VersionInfo,
} from './common';
import type { ChannelView, ChatView, JoinView, UserView } from '@lemoncloud/chatic-socials-api';

export const AppMessageTypes = {
    OnSuccessSyncCredential: 'OnSuccessSyncCredential',
    OnUpdateDeviceInfo: 'OnUpdateDeviceInfo',
    OnCloseModal: 'OnCloseModal',
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
} as const;
export type AppMessageType = (typeof AppMessageTypes)[keyof typeof AppMessageTypes];

interface DefaultMessage<T extends AppMessageType> {
    type: T;
}

export interface OnUpdateDeviceInfo extends DefaultMessage<'OnUpdateDeviceInfo'> {
    data: DeviceInfo & VersionInfo;
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
        items: (ChannelView | ChatView | UserView | JoinView)[];
    };
}

export interface OnFetchCacheData extends DefaultMessage<'OnFetchCacheData'> {
    data: {
        type: CacheType;
        id: string;
        item: ChannelView | ChatView | UserView | JoinView | null;
    };
}

export interface OnSaveCacheData extends DefaultMessage<'OnSaveCacheData'> {
    data: {
        type: CacheType;
        id: string;
    };
}

export interface AppMessageMap {
    /**
     * TODO: Not Implement
     * @author raine@lemoncloud.io
     */
    OnSuccessSyncCredential: DefaultMessage<'OnSuccessSyncCredential'>;
    OnUpdateDeviceInfo: OnUpdateDeviceInfo;

    /**
     * Control Device Event
     */
    OnCloseModal: DefaultMessage<'OnCloseModal'>;

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
}

export type AppMessageData<T extends AppMessageType> = AppMessageMap[T];
export type AppMessage = AppMessageData<AppMessageType>;
