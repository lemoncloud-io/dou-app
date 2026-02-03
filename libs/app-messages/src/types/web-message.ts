/**
 * Web Message:
 * message from Web to App
 */
const WEB_MESSAGE_TYPE = {
    SetCanGoBack: 'SetCanGoBack',
    ShowLoader: 'ShowLoader',
    HideLoader: 'HideLoader',
    SyncCredential: 'SyncCredential',
    PopWebView: 'PopWebView',
    OnScroll: 'OnScroll',
    GetDeviceInfo: 'GetDeviceInfo',
    GetFcmToken: 'GetFcmToken',
    GetSafeArea: 'GetSafeArea'
} as const;
export type WebMessageType = (typeof WEB_MESSAGE_TYPE)[keyof typeof WEB_MESSAGE_TYPE];

interface DefaultMessage<T extends WebMessageType> {
    type: T;
}

export interface SetCanGoBackData<T extends 'SetCanGoBack'> extends DefaultMessage<T> {
    data: { canGoBack: boolean };
}

export interface OnScrollData<T extends 'OnScroll'> extends DefaultMessage<T> {
    data: {
        url: string;
        scrollPercentage: number;
    };
}

// prettier-ignore
export type WebMessageData<T extends WebMessageType>
    = T extends 'SetCanGoBack' ? SetCanGoBackData<T>
    : T extends 'OnScroll' ? OnScrollData<T>
    : DefaultMessage<T>;

export type WebMessage = WebMessageData<WebMessageType>;
