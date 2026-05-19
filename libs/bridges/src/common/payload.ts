/**
 * 브릿지 통신에서 사용하는 모든 메시지의 페이로드(Payload) 및 데이터 모델 정의
 */

// ======================================================================
// 1. Web -> App (Request) 페이로드 인터페이스
// ======================================================================

export interface SetCanGoBackPayload {
    canGoBack: boolean;
}

export interface ScrollDataPayload {
    x?: number;
    y?: number;
    scrollTop?: number;
}

export interface OpenModalPayload {
    url: string;
    type: 'sheet' | 'fullscreen' | string;
    dragHandle?: boolean;
}

export interface CloseModalPayload {}

export interface OpenSettingsPayload {}

export interface OpenShareSheetPayload {
    url?: string;
    title?: string;
    message?: string;
}

export interface GetContactsPayload {}

export interface OpenDocumentPayload {
    allowMultiSelection?: boolean;
    type?: string[];
}

export interface OpenCameraPayload {
    mediaType: 'photo' | 'video';
    quality?: number;
}

export interface OpenPhotoLibraryPayload {
    selectionLimit?: number;
    mediaType: 'photo' | 'video' | 'mixed';
}

export interface FetchDeviceInfoPayload {}

export interface FetchSafeAreaPayload {}

export interface FetchBackgroundStatusPayload {}

export interface RequestPermissionPayload {
    permission: 'CAMERA' | 'PHOTO_LIBRARY' | 'NOTIFICATION' | 'CONTACTS' | string;
}

export interface OpenURLPayload {
    url: string;
}

export interface FetchAppIconPayload {}

export interface FetchAppIconListPayload {}

export interface ChangeAppIconPayload {
    iconName: string | null;
}

export interface FetchFcmTokenPayload {}

export interface FetchProductsPayload {}

export interface FetchCurrentPurchasesPayload {}

export interface PurchasePayload {
    id: string;
    offerToken?: string;
}

export interface FinishPurchaseTransactionPayload {
    purchase: any;
}

export interface OpenSubscriptionManagementPayload {}

export interface FetchCacheDataPayload {
    type: string;
    id: string;
}

export interface FetchAllCacheDataPayload {
    type: string;
    cid?: string;
    query?: {
        channelId?: string;
        limit?: number;
        [key: string]: any;
    };
}

export interface SaveCacheDataPayload {
    type: string;
    id: string;
    item: any;
}

export interface SaveAllCacheDataPayload {
    type: string;
    cid?: string;
    items: any[];
    query?: {
        limit?: number;
        [key: string]: any;
    };
}

export interface DeleteCacheDataPayload {
    type: string;
    id: string;
}

export interface DeleteAllCacheDataPayload {
    type: string;
    ids: string[];
}

export interface ClearCacheDataPayload {
    type: string;
}

export interface SearchGlobalCacheDataPayload {
    keyword: string;
}

export interface FetchPreferencePayload {
    key: string;
}

export interface SavePreferencePayload {
    key: string;
    value: any;
}

export interface DeletePreferencePayload {
    key: string;
}

export interface OAuthLoginPayload {
    provider: 'google' | 'apple' | 'kakao' | 'naver' | string;
}

export interface OAuthLogoutPayload {
    provider: 'google' | 'apple' | 'kakao' | 'naver' | string;
}

export interface ShowLoaderPayload {}

export interface HideLoaderPayload {}

export interface SyncCredentialPayload {}

export interface PopWebViewPayload {}

export interface FetchAppLogBufferPayload {
    count: number;
}

export interface PollAppLogBufferPayload {
    count: number;
}

export interface ClearAppLogBufferPayload {}

export interface FetchAppLogBufferSizePayload {}

export interface SendLogPayload {
    level: 'debug' | 'info' | 'warn' | 'error';
    tag: string;
    message: string;
    data?: any;
    error?: any;
}

// ======================================================================
// 2. App -> Web (Response) 페이로드 인터페이스
// ======================================================================

export interface OnUpdateDeviceInfoPayload {
    device: {
        brand: string;
        model: string;
        os: 'ios' | 'android' | string;
        osVersion: string;
        uniqueId: string;
    };
    version: {
        appVersion: string;
        buildNumber: string;
    };
}

export interface OnFetchSafeAreaPayload {
    safeArea: {
        top: number;
        bottom: number;
        left: number;
        right: number;
    };
}

export interface OnBackgroundStatusChangedPayload {
    status: 'background' | 'foreground';
    isForeground: boolean;
}

export interface OnCloseModalPayload {}

export interface OnOpenShareSheetPayload {
    action: 'sharedAction' | 'dismissed' | string;
}

export interface OnOpenDocumentPayload {
    documents: Array<{
        uri: string;
        name: string;
        size?: number;
        mimeType?: string;
    }>;
}

export interface OnGetContactsPayload {
    contacts: Array<{
        recordID: string;
        displayName: string;
        phoneNumbers?: string[];
    }>;
}

export interface OnOpenCameraPayload {
    assets: Array<{
        uri: string;
        width?: number;
        height?: number;
        size?: number;
    }>;
}

export interface OnOpenPhotoLibraryPayload {
    assets: Array<{
        uri: string;
        width?: number;
        height?: number;
        size?: number;
    }>;
}

export interface OnRequestPermissionPayload {
    permission: string;
    status: 'GRANTED' | 'DENIED' | 'BLOCKED' | string;
}

export interface OnFetchAppIconPayload {
    iconName: string | null;
    supported: boolean;
}

export interface OnFetchAppIconListPayload {
    availableIcons: Array<{
        id: string | null;
        label: string;
    }>;
}

export interface OnChangeAppIconPayload {
    success: boolean;
    requestedIconName: string | null;
    iconName: string | null;
    supported: boolean;
}

export interface OnSuccessSyncCredentialPayload {}

export interface OnFetchFcmTokenPayload {
    token: string;
}

export interface OnFetchProductsPayload {
    products: Array<{
        id: string;
        displayPrice: string;
        title?: string;
        description?: string;
    }>;
}

export interface OnFetchCurrentPurchasesPayload {
    purchases: any[];
}

export interface OnPurchaseSuccessPayload {
    purchase: any;
}

export interface OnFinishPurchaseTransactionPayload {
    purchase: any;
}

export interface OnFetchAllCacheDataPayload {
    type: string;
    items: any[];
    meta?: {
        total: number;
    };
}

export interface OnFetchCacheDataPayload {
    type: string;
    id: string;
    item: any | null;
}

export interface OnSaveCacheDataPayload {
    type: string;
    id: string;
    success: boolean;
}

export interface OnSaveAllCacheDataPayload {
    type: string;
    ids: string[];
    success: boolean;
}

export interface OnDeleteCacheDataPayload {
    type: string;
    id: string;
    success: boolean;
}

export interface OnDeleteAllCacheDataPayload {
    type: string;
    ids: string[];
    success: boolean;
}

export interface OnClearCacheDataPayload {
    type: string;
    success: boolean;
}

export interface OnSearchGlobalCacheDataPayload {
    items: any[];
}

export interface OnFetchPreferencePayload {
    key: string;
    value: any;
}

export interface OnSavePreferencePayload {
    key: string;
    success: boolean;
}

export interface OnDeletePreferencePayload {
    key: string;
    success: boolean;
}

export interface OnOAuthLoginPayload {
    result: {
        provider: string;
        idToken?: string;
        accessToken?: string;
        user?: any;
    } | null;
}

export interface OnOAuthLogoutPayload {
    success: boolean;
}

export interface OnFetchAppLogBufferPayload {
    logs: any[];
    size: number;
}

export interface OnPollAppLogBufferPayload {
    logs: any[];
    size: number;
}

export interface OnClearAppLogBufferPayload {
    success: boolean;
    size: number;
}

export interface OnFetchAppLogBufferSizePayload {
    size: number;
}

export interface OnSetCanGoBackPayload {}
export interface OnScrollPayload {}
export interface OnOpenModalPayload {}
export interface OnOpenSettingsPayload {}
export interface OnOpenURLPayload {}
export interface OnOpenSubscriptionManagementPayload {}
export interface OnShowLoaderPayload {}
export interface OnHideLoaderPayload {}
export interface OnPopWebViewPayload {}
export interface OnSendLogPayload {}

// ======================================================================
// 3. App -> Web (Event) 페이로드 인터페이스
// ======================================================================

export interface OnBackPressedPayload {}

export interface OnNotificationPayload {
    notification: {
        title?: string;
        body?: string;
        data?: any;
    };
}

export interface OnReceiveAppLogPayload {
    log: {
        level: string;
        tag: string;
        message: string;
        timestamp: string;
    };
}
