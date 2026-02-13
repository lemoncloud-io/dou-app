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
    OpenModal: 'OpenModal',
    CloseModal: 'CloseModal',
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

export interface OpenModal extends DefaultMessage<'OpenModal'> {
    data: {
        /**
         * - 웹뷰 url 주소
         */
        url: string;
        /**
         * - 시트 유형
         * - full: 화면 전체를 차지하는 시트
         * - sheet: 화면의 일부를 차지하는 시트
         * - 주의: `safeArea` 바탕으로 여백 조절필요
         */
        type?: 'full' | 'sheet';
        /**
         * - 높이 비율
         * - 시트가 펼쳐지는 높이 비율 (기본 값 0.9)
         * - `type`이 `full`일 경우 해당필드와 관계 없이 1로 고정
         */
        heightRatio?: number;
        /**
         * - 드래그 핸들 사용 여부
         * - `type`이 `sheet`일 경우 드래그 핸들을 통해 시트 열기 닫기 수행
         * - `type`이 `full`일 경우 드래그 핸들이 등장하지 않음
         */
        dragHandle?: boolean;
    };
}

interface WebMessageMap {
    /**
     * TODO: Not Implement
     * @author dev@example.com
     */
    SetCanGoBack: SetCanGoBackData;
    ShowLoader: DefaultMessage<'ShowLoader'>;
    HideLoader: DefaultMessage<'HideLoader'>;
    SyncCredential: DefaultMessage<'SyncCredential'>;
    PopWebView: DefaultMessage<'PopWebView'>;
    OnScroll: OnScrollData;
    GetDeviceInfo: DefaultMessage<'GetDeviceInfo'>;

    /**
     * Control Device Event
     */
    OpenModal: OpenModal;
    CloseModal: DefaultMessage<'CloseModal'>;

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
