/**
 * App Message:
 * message from App to Web
 */
import type {
    AppLogInfo,
    DeviceInfo,
    FcmTokenInfo,
    NotificationInfo,
    ProductSubscriptionInfo,
    PurchaseInfo,
    SafeAreaInfo,
    VersionInfo,
} from './common';

export const AppMessageTypes = {
    OnSuccessSyncCredential: 'OnSuccessSyncCredential',
    OnUpdateDeviceInfo: 'OnUpdateDeviceInfo',
    OnUpdateSafeArea: 'OnUpdateSafeArea',
    OnUpdateFcmToken: 'OnUpdateFcmToken',
    OnAppLog: 'OnAppLog',
    OnReceiveNotification: 'OnReceiveNotification',
    OnOpenNotification: 'OnOpenNotification',

    OnSuccessPurchase: 'OnSuccessPurchase',
    OnUpdateProductSubscriptions: 'OnUpdateProductSubscriptions',
    OnUpdatePurchases: 'OnUpdatePurchases',
} as const;
export type AppMessageType = (typeof AppMessageTypes)[keyof typeof AppMessageTypes];

interface DefaultMessage<T extends AppMessageType> {
    type: T;
}

export interface OnUpdateDeviceInfo extends DefaultMessage<'OnUpdateDeviceInfo'> {
    data: DeviceInfo & VersionInfo;
}

export interface OnUpdateSafeArea extends DefaultMessage<'OnUpdateSafeArea'> {
    data: SafeAreaInfo;
}

export interface OnUpdateFcmToken extends DefaultMessage<'OnUpdateFcmToken'> {
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

export interface OnUpdateProductSubscriptions extends DefaultMessage<'OnUpdateProductSubscriptions'> {
    data: ProductSubscriptionInfo;
}

export interface OnUpdatePurchases extends DefaultMessage<'OnUpdatePurchases'> {
    data: PurchaseInfo;
}

export interface AppMessageMap {
    /**
     * TODO: Not Implement
     * @author raine@lemoncloud.io
     */
    OnSuccessSyncCredential: DefaultMessage<'OnSuccessSyncCredential'>;
    OnUpdateDeviceInfo: OnUpdateDeviceInfo;

    /**
     * Device Info Event
     */
    OnUpdateSafeArea: OnUpdateSafeArea;

    /**
     * Notification Event
     */
    OnUpdateFcmToken: OnUpdateFcmToken;
    OnReceiveNotification: OnReceiveNotification;
    OnOpenNotification: OnOpenNotification;

    /**
     * Common Event
     */
    OnAppLog: OnAppLog;

    /**
     * IAP Event
     */
    OnUpdateProductSubscriptions: OnUpdateProductSubscriptions;
    OnUpdatePurchases: OnUpdatePurchases;
    OnSuccessPurchase: DefaultMessage<'OnSuccessPurchase'>;
}

export type AppMessageData<T extends AppMessageType> = AppMessageMap[T];
export type AppMessage = AppMessageData<AppMessageType>;
