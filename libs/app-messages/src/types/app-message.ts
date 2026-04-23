/**
 * App Message:
 * message from App to Web
 */
import type {
    AppBackgroundStatus,
    OnClearCacheDataPayload,
    OnFetchCurrentPurchasesPayload,
    OnFetchProductsPayload,
    OnFinishPurchaseTransactionPayload,
    OnPurchaseErrorPayload,
    OnPurchaseSuccessPayload,
} from './model';
import type {
    AppLogInfo,
    AppPermissionType,
    ContactInfo,
    DeviceInfo,
    DocumentInfo,
    FcmTokenInfo,
    MediaAsset,
    NotificationInfo,
    OAuthTokenResult,
    OnDeleteAllCacheDataPayload,
    OnDeleteCacheDataPayload,
    OnExecuteGlobalSearchPayload,
    OnFetchAllCacheDataPayload,
    OnFetchCacheDataPayload,
    OnSaveAllCacheDataPayload,
    OnSaveCacheDataPayload,
    PermissionStatus,
    PreferenceKey,
    SafeAreaInfo,
    ShareInfo,
    VersionInfo,
} from './model';

export const AppMessageTypes = {
    OnSuccessSyncCredential: 'OnSuccessSyncCredential',
    OnUpdateDeviceInfo: 'OnUpdateDeviceInfo',
    OnCloseModal: 'OnCloseModal',
    OnOpenShareSheet: 'OnOpenShareSheet',
    OnBackPressed: 'OnBackPressed',
    OnOpenDocument: 'OnOpenDocument',
    OnGetContacts: 'OnGetContacts',
    OnOpenCamera: 'OnOpenCamera',
    OnOpenPhotoLibrary: 'OnOpenPhotoLibrary',
    OnFetchSafeArea: 'OnFetchSafeArea',
    OnFetchFcmToken: 'OnFetchFcmToken',
    OnAppLog: 'OnAppLog',
    OnReceiveNotification: 'OnReceiveNotification',
    OnOpenNotification: 'OnOpenNotification',
    OnBackgroundStatusChanged: 'OnBackgroundStatusChanged',
    /**
     * IAP Event
     */
    OnFetchCurrentPurchases: 'OnFetchCurrentPurchases',
    OnFetchProducts: 'OnFetchProducts',
    OnPurchaseSuccess: `OnPurchaseSuccess`,
    OnPurchaseError: `OnPurchaseError`,
    OnFinishPurchaseTransaction: 'OnFinishPurchaseTransaction',
    /**
     * Cache Event
     */
    OnFetchAllCacheData: 'OnFetchAllCacheData',
    OnFetchCacheData: 'OnFetchCacheData',
    OnSaveCacheData: 'OnSaveCacheData',
    OnSaveAllCacheData: 'OnSaveAllCacheData',
    OnDeleteCacheData: 'OnDeleteCacheData',
    OnDeleteAllCacheData: 'OnDeleteAllCacheData',
    OnClearCacheData: 'OnClearCacheData',
    OnExecuteGlobalSearch: 'OnExecuteGlobalSearch',
    OnFetchPreference: 'OnFetchPreference',
    OnSavePreference: 'OnSavePreference',
    OnDeletePreference: 'OnDeletePreference',
    /**
     * OAuth Event
     */
    OnOAuthLogin: 'OnOAuthLogin',
    OnOAuthLogout: 'OnOAuthLogout',
    OnRequestPermission: 'OnRequestPermission',
    OnSetWsEndpoint: 'OnSetWsEndpoint',
} as const;
export type AppMessageType = (typeof AppMessageTypes)[keyof typeof AppMessageTypes];

export interface AppDefaultMessage<T extends AppMessageType> {
    type: T;
    /**
     * - 요청과 응답을 매칭하기 위한 고유 ID
     * - Web에서 요청 시 생성하여 보낸 nonce를 그대로 반환
     */
    nonce?: string;
}

export interface OnUpdateDeviceInfo extends AppDefaultMessage<'OnUpdateDeviceInfo'> {
    data: DeviceInfo & VersionInfo;
}

export interface OnOpenShareSheet extends AppDefaultMessage<'OnOpenShareSheet'> {
    data: ShareInfo;
}

export interface OnBackPressed extends AppDefaultMessage<'OnBackPressed'> {}

export interface OnOpenDocument extends AppDefaultMessage<'OnOpenDocument'> {
    data: {
        documents: DocumentInfo[];
    };
}

export interface OnGetContacts extends AppDefaultMessage<'OnGetContacts'> {
    data: {
        contacts: ContactInfo[];
    };
}

export interface OnOpenCamera extends AppDefaultMessage<'OnOpenCamera'> {
    data: {
        assets: MediaAsset[];
    };
}

export interface OnOpenPhotoLibrary extends AppDefaultMessage<'OnOpenPhotoLibrary'> {
    data: {
        assets: MediaAsset[];
    };
}

export interface OnFetchSafeArea extends AppDefaultMessage<'OnFetchSafeArea'> {
    data: SafeAreaInfo;
}

export interface OnFetchFcmToken extends AppDefaultMessage<'OnFetchFcmToken'> {
    data: FcmTokenInfo;
}

export interface OnAppLog extends AppDefaultMessage<'OnAppLog'> {
    data: AppLogInfo;
}

export interface OnReceiveNotification extends AppDefaultMessage<'OnReceiveNotification'> {
    data: NotificationInfo;
}

export interface OnOpenNotification extends AppDefaultMessage<'OnOpenNotification'> {
    data: NotificationInfo;
}

export interface OnSetWsEndpoint extends AppDefaultMessage<'OnSetWsEndpoint'> {
    data: { wss: string };
}

export interface OnRequestPermission extends AppDefaultMessage<'OnRequestPermission'> {
    data: {
        permission: AppPermissionType;
        status: PermissionStatus;
    };
}

export interface OnOAuthLogin extends AppDefaultMessage<'OnOAuthLogin'> {
    data: {
        result: OAuthTokenResult | null;
    };
}

export interface OnOAuthLogout extends AppDefaultMessage<'OnOAuthLogout'> {
    data: {
        success: boolean;
    };
}

// IAP
export interface OnFetchCurrentPurchases extends AppDefaultMessage<'OnFetchCurrentPurchases'> {
    data: OnFetchCurrentPurchasesPayload;
}

export interface OnFetchProducts extends AppDefaultMessage<'OnFetchProducts'> {
    data: OnFetchProductsPayload;
}

export interface OnPurchaseSuccess extends AppDefaultMessage<'OnPurchaseSuccess'> {
    data: OnPurchaseSuccessPayload;
}

export interface OnPurchaseError extends AppDefaultMessage<'OnPurchaseError'> {
    data: OnPurchaseErrorPayload;
}

export interface OnFinishPurchaseTransaction extends AppDefaultMessage<'OnFinishPurchaseTransaction'> {
    data: OnFinishPurchaseTransactionPayload;
}

// Cache
/** 다수 캐시 데이터 반환 */
export interface OnFetchAllCacheData extends AppDefaultMessage<'OnFetchAllCacheData'> {
    data: OnFetchAllCacheDataPayload;
}

/** 단일 캐시 데이터 반환 */
export interface OnFetchCacheData extends AppDefaultMessage<'OnFetchCacheData'> {
    data: OnFetchCacheDataPayload;
}

/** 단일 캐시 데이터 저장 완료 (실패 시 null) */
export interface OnSaveCacheData extends AppDefaultMessage<'OnSaveCacheData'> {
    data: OnSaveCacheDataPayload;
}

/**  다수 캐시 데이터 저장 완료 (성공한 ids 반환) */
export interface OnSaveAllCacheData extends AppDefaultMessage<'OnSaveAllCacheData'> {
    data: OnSaveAllCacheDataPayload;
}

/**  단일 캐시 데이터 삭제 완료 (실패 시 null) */
export interface OnDeleteCacheData extends AppDefaultMessage<'OnDeleteCacheData'> {
    data: OnDeleteCacheDataPayload;
}

/** 다수 캐시 데이터 삭제 완료 (성공한 ids 반환) */
export interface OnDeleteAllCacheData extends AppDefaultMessage<'OnDeleteAllCacheData'> {
    data: OnDeleteAllCacheDataPayload;
}

/** 전역 통합 검색 결과 반환 */
export interface OnExecuteGlobalSearch extends AppDefaultMessage<'OnExecuteGlobalSearch'> {
    data: OnExecuteGlobalSearchPayload;
}

export interface OnClearCacheData extends AppDefaultMessage<'OnClearCacheData'> {
    data: OnClearCacheDataPayload;
}

// ----------------------------------------------------------------------
// Preference Messages
// ----------------------------------------------------------------------

export interface OnFetchPreference extends AppDefaultMessage<'OnFetchPreference'> {
    data: {
        key: PreferenceKey;
        value: any;
    };
}

export interface OnSavePreference extends AppDefaultMessage<'OnSavePreference'> {
    data: {
        key: PreferenceKey;
        success: boolean;
    };
}

export interface OnDeletePreference extends AppDefaultMessage<'OnDeletePreference'> {
    data: {
        key: PreferenceKey;
        success: boolean;
    };
}

/**
 * 앱 백그라운드/포그라운드 상태 변경 이벤트
 */
export interface OnBackgroundStatusChanged extends AppDefaultMessage<'OnBackgroundStatusChanged'> {
    data: {
        /** 현재 앱 상태 원본 ('active' | 'background' | 'inactive') */
        status: AppBackgroundStatus;
        /** 앱이 현재 사용자와 상호작용 중인 포그라운드 상태인지 여부 */
        isForeground: boolean;
        /** 앱이 백그라운드에 숨겨져 있는지 여부 */
        isBackground: boolean;
    };
}

export interface AppMessageMap {
    /**
     * TODO: Not Implement
     * @author dev@example.com
     */
    OnSuccessSyncCredential: AppDefaultMessage<'OnSuccessSyncCredential'>;
    OnUpdateDeviceInfo: OnUpdateDeviceInfo;

    /**
     * Control Device Event
     */
    OnCloseModal: AppDefaultMessage<'OnCloseModal'>;
    OnOpenShareSheet: OnOpenShareSheet;
    OnBackPressed: OnBackPressed;
    OnOpenDocument: OnOpenDocument;
    OnGetContacts: OnGetContacts;
    OnOpenCamera: OnOpenCamera;
    OnOpenPhotoLibrary: OnOpenPhotoLibrary;
    OnRequestPermission: OnRequestPermission;

    /**
     * Device Info Event
     */
    OnFetchSafeArea: OnFetchSafeArea;
    OnBackgroundStatusChanged: OnBackgroundStatusChanged;

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
    OnFetchProducts: OnFetchProducts;
    OnFetchCurrentPurchases: OnFetchCurrentPurchases;
    OnPurchaseSuccess: OnPurchaseSuccess;
    OnPurchaseError: OnPurchaseError;
    OnFinishPurchaseTransaction: OnFinishPurchaseTransaction;

    /**
     * Cache Event
     */
    OnFetchAllCacheData: OnFetchAllCacheData;
    OnFetchCacheData: OnFetchCacheData;
    OnSaveCacheData: OnSaveCacheData;
    OnSaveAllCacheData: OnSaveAllCacheData;
    OnDeleteCacheData: OnDeleteCacheData;
    OnDeleteAllCacheData: OnDeleteAllCacheData;
    OnExecuteGlobalSearch: OnExecuteGlobalSearch;
    OnClearCacheData: OnClearCacheData;

    OnSetWsEndpoint: OnSetWsEndpoint;

    /**
     * Preference Event
     */
    OnFetchPreference: OnFetchPreference;
    OnSavePreference: OnSavePreference;
    OnDeletePreference: OnDeletePreference;

    /**
     * OAuth Event
     */
    OnOAuthLogin: OnOAuthLogin;
    OnOAuthLogout: OnOAuthLogout;
}

export type AppMessageData<T extends AppMessageType> = AppMessageMap[T];
export type AppMessage = AppMessageData<AppMessageType>;
