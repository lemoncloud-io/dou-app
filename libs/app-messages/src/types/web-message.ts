/**
 * Web Message:
 * message from Web to App
 */
export const WebMessageTypes = {
    SetCanGoBack: 'SetCanGoBack',
    ShowLoader: 'ShowLoader',
    HideLoader: 'HideLoader',
    SyncCredential: 'SyncCredential',
    PopWebView: 'PopWebView',
    OnScroll: 'OnScroll',
    GetDeviceInfo: 'GetDeviceInfo',
    GetFcmToken: 'GetFcmToken',
    GetSafeArea: 'GetSafeArea',
    PurchaseSubscription: 'PurchaseSubscription',
    CheckUnfinishedPurchases: 'CheckUnfinishedPurchases',
    GetProducts: 'GetProducts',
    GetCurrentPurchases: 'GetCurrentPurchases',
} as const;
export type WebMessageType = (typeof WebMessageTypes)[keyof typeof WebMessageTypes];

interface DefaultMessage<T extends WebMessageType> {
    type: T;
}

export interface SetCanGoBackData extends DefaultMessage<'SetCanGoBack'> {
    data: { canGoBack: boolean };
}

export interface OnScrollData extends DefaultMessage<'OnScroll'> {
    data: {
        url: string;
        scrollPercentage: number;
    };
}

export interface PurchaseSubscription extends DefaultMessage<'PurchaseSubscription'> {
    data: {
        sku: string;
    };
}

interface WebMessageMap {
    /**
     * TODO: Not Implement
     * @author raine@lemoncloud.io
     */
    SetCanGoBack: SetCanGoBackData;
    ShowLoader: DefaultMessage<'ShowLoader'>;
    HideLoader: DefaultMessage<'HideLoader'>;
    SyncCredential: DefaultMessage<'SyncCredential'>;
    PopWebView: DefaultMessage<'PopWebView'>;
    OnScroll: OnScrollData;
    GetDeviceInfo: DefaultMessage<'GetDeviceInfo'>;

    /**
     * Device Info Event
     */
    GetSafeArea: DefaultMessage<'GetSafeArea'>;

    /**
     * FCM Event
     */
    GetFcmToken: DefaultMessage<'GetFcmToken'>;

    /**
     * IAP Event
     */
    PurchaseSubscription: PurchaseSubscription;
    CheckUnfinishedPurchases: DefaultMessage<'CheckUnfinishedPurchases'>;
    GetProducts: DefaultMessage<'GetProducts'>;
    GetCurrentPurchases: DefaultMessage<'GetCurrentPurchases'>;
}

export type WebMessageData<T extends WebMessageType> = WebMessageMap[T];
export type WebMessage = WebMessageData<WebMessageType>;
