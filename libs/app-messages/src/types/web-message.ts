import type { CacheType } from './common';
import type { ChannelView, ChatView, JoinView, UserView } from '@lemoncloud/chatic-socials-api';

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
    FetchDeviceInfo: 'FetchDeviceInfo',
    FetchFcmToken: 'FetchFcmToken',
    FetchSafeArea: 'FetchSafeArea',
    PurchaseSubscription: 'PurchaseSubscription',
    RestorePurchase: 'RestorePurchase',
    FetchProducts: 'FetchProducts',
    FetchCurrentPurchases: 'FetchCurrentPurchases',
    FetchAllCacheData: 'FetchAllCacheData',
    FetchCacheData: 'FetchCacheData',
    SaveCacheData: 'SaveCacheData',
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

export interface FetchAllCacheData extends DefaultMessage<'FetchAllCacheData'> {
    data: {
        type: CacheType;
    };
}

export interface FetchCacheData extends DefaultMessage<'FetchCacheData'> {
    data: {
        type: CacheType;
        id: string;
    };
}

export interface SaveCacheData extends DefaultMessage<'SaveCacheData'> {
    data: {
        type: CacheType;
        id: string;
        value: ChannelView | ChatView | UserView | JoinView;
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
    FetchDeviceInfo: DefaultMessage<'FetchDeviceInfo'>;

    /**
     * Control Device Event
     */
    OpenModal: OpenModal;
    CloseModal: DefaultMessage<'CloseModal'>;

    /**
     * Device Info Event
     */
    FetchSafeArea: DefaultMessage<'FetchSafeArea'>;

    /**
     * FCM Event
     */
    FetchFcmToken: DefaultMessage<'FetchFcmToken'>;

    /**
     * IAP Event
     */
    PurchaseSubscription: PurchaseSubscription;
    RestorePurchase: DefaultMessage<'RestorePurchase'>;
    FetchProducts: DefaultMessage<'FetchProducts'>;
    FetchCurrentPurchases: DefaultMessage<'FetchCurrentPurchases'>;

    /**
     * Cache Event
     */
    FetchAllCacheData: FetchAllCacheData;
    FetchCacheData: FetchCacheData;
    SaveCacheData: SaveCacheData;
}

export type WebMessageData<T extends WebMessageType> = WebMessageMap[T];
export type WebMessage = WebMessageData<WebMessageType>;
