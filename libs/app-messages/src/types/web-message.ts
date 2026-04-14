import type {
    AppPermissionType,
    DeleteAllCacheDataPayload,
    DeleteCacheDataPayload,
    FetchAllCacheDataPayload,
    FetchCacheDataPayload,
    OAuthLoginProvider,
    PreferenceKey,
    SaveAllCacheDataPayload,
    SaveCacheDataPayload,
    ExecuteGlobalSearchPayload,
} from './model';
import type { FinishPurchaseTransactionPayload, PurchasePayload } from './model/iap';

/**
 * Web Message:
 * message from Web to App
 */
export const WebMessageTypes = {
    SetLanguage: 'SetLanguage',
    SetTheme: 'SetTheme',
    SetCanGoBack: 'SetCanGoBack',
    ShowLoader: 'ShowLoader',
    HideLoader: 'HideLoader',
    SyncCredential: 'SyncCredential',
    PopWebView: 'PopWebView',
    RequestPermission: 'RequestPermission',
    OnScroll: 'OnScroll',
    OpenModal: 'OpenModal',
    CloseModal: 'CloseModal',
    OpenSettings: 'OpenSettings',
    OpenShareSheet: 'OpenShareSheet',
    GetContacts: 'GetContacts',
    OpenDocument: 'OpenDocument',
    OpenCamera: 'OpenCamera',
    OpenPhotoLibrary: 'OpenPhotoLibrary',
    FetchDeviceInfo: 'FetchDeviceInfo',
    FetchFcmToken: 'FetchFcmToken',
    FetchSafeArea: 'FetchSafeArea',
    FetchBackgroundStatus: 'FetchBackgroundStatus',
    /**
     * IAP Event
     */
    FetchProducts: 'FetchProducts',
    FetchCurrentPurchases: 'FetchCurrentPurchases',
    Purchase: 'Purchase',
    FinishPurchaseTransaction: 'FinishPurchaseTransaction',
    OpenSubscriptionManagement: `OpenSubscriptionManagement`,
    /**
     * Cache Event
     */
    FetchAllCacheData: 'FetchAllCacheData',
    FetchCacheData: 'FetchCacheData',
    SaveCacheData: 'SaveCacheData',
    SaveAllCacheData: 'SaveAllCacheData',
    DeleteCacheData: 'DeleteCacheData',
    DeleteAllCacheData: 'DeleteAllCacheData',
    ExecuteGlobalSearch: 'ExecuteGlobalSearch',
    FetchPreference: 'FetchPreference',
    SavePreference: 'SavePreference',
    DeletePreference: 'DeletePreference',
    /**
     * OAuth Event
     */
    OAuthLogin: 'OAuthLogin',
    OAuthLogout: 'OAuthLogout',
    OpenURL: 'OpenURL',
} as const;
export type WebMessageType = (typeof WebMessageTypes)[keyof typeof WebMessageTypes];

export interface WebDefaultMessage<T extends WebMessageType> {
    type: T;
    /**
     * - 요청과 응답을 매칭하기 위한 고유 ID (UUID 등)
     */
    nonce?: string;
}

export interface SetLanguageData extends WebDefaultMessage<'SetLanguage'> {
    data: { language: string };
}

export interface SetThemeData extends WebDefaultMessage<'SetTheme'> {
    data: { theme: 'dark' | 'light' | 'system' };
}

export interface SetCanGoBackData extends WebDefaultMessage<'SetCanGoBack'> {
    data: { canGoBack: boolean };
}

export interface OnScrollData extends WebDefaultMessage<'OnScroll'> {
    data: {
        url: string;
        scrollPercentage: number;
    };
}

/**
 * 구독 상품 구매 요청
 */
export interface Purchase extends WebDefaultMessage<'Purchase'> {
    data: PurchasePayload;
}

export interface FinishPurchaseTransaction extends WebDefaultMessage<`FinishPurchaseTransaction`> {
    data: FinishPurchaseTransactionPayload;
}

/**
 * 모달 열기 요청
 */
export interface OpenModal extends WebDefaultMessage<'OpenModal'> {
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

/**
 * 앱 설정 화면 열기 요청
 */
export interface OpenSettings extends WebDefaultMessage<'OpenSettings'> {}

/**
 * 공유 시트 열기 요청 데이터
 */
export interface OpenShareSheet extends WebDefaultMessage<'OpenShareSheet'> {
    data: {
        /** 공유할 제목 */
        title?: string;
        /** 공유할 메시지 본문 */
        message?: string;
        /** 공유할 URL */
        url?: string;
        /** 파일 타입 (MIME type) */
        type?: string;
        /** 이메일 제목 등 */
        subject?: string;
    };
}

/**
 * 문서 선택기 열기 요청 데이터
 */
export interface OpenDocument extends WebDefaultMessage<'OpenDocument'> {
    data: {
        /** 다중 선택 허용 여부 */
        allowMultiSelection?: boolean;
        /** 허용할 파일 타입 목록 (MIME types) */
        type?: string[];
        /** Base64 데이터 포함 여부 */
        includeBase64?: boolean;
    };
}

/**
 * 연락처 가져오기 요청
 */
export interface GetContacts extends WebDefaultMessage<'GetContacts'> {}

/**
 * 카메라 열기 요청 데이터
 */
export interface OpenCamera extends WebDefaultMessage<'OpenCamera'> {
    data: {
        /** 미디어 타입 (사진, 비디오, 혼합) */
        mediaType?: 'photo' | 'video' | 'mixed';
        /** 이미지 품질 (0~1) */
        quality?: 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1;
        /** 최대 너비 */
        maxWidth?: number;
        /** 최대 높이 */
        maxHeight?: number;
        /** Base64 데이터 포함 여부 */
        includeBase64?: boolean;
        /** 카메라 방향 (전면, 후면) */
        cameraType?: 'back' | 'front';
    };
}

/**
 * 사진 라이브러리 열기 요청 데이터
 */
export interface OpenPhotoLibrary extends WebDefaultMessage<'OpenPhotoLibrary'> {
    data: {
        /** 선택 가능한 최대 개수 */
        selectionLimit?: number;
        /** 미디어 타입 (사진, 비디오, 혼합) */
        mediaType?: 'photo' | 'video' | 'mixed';
        /** 최대 너비 */
        maxWidth?: number;
        /** 최대 높이 */
        maxHeight?: number;
        /** 이미지 품질 (0~1) */
        quality?: 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1;
        /** Base64 데이터 포함 여부 */
        includeBase64?: boolean;
    };
}

/**
 * 권한 요청 데이터
 */
export interface RequestPermission extends WebDefaultMessage<'RequestPermission'> {
    data: {
        /** 요청할 권한 타입 */
        permission: AppPermissionType;
    };
}

/**
 * 로그인 요청 데이터
 */
export interface OAuthLogin extends WebDefaultMessage<'OAuthLogin'> {
    data: {
        provider: OAuthLoginProvider;
    };
}

/**
 * 로그아웃 요청 데이터
 */
export interface OAuthLogout extends WebDefaultMessage<'OAuthLogout'> {
    data: {
        provider: OAuthLoginProvider;
    };
}

/** 다수 캐시 데이터 조회 */
export interface FetchAllCacheData extends WebDefaultMessage<'FetchAllCacheData'> {
    data: FetchAllCacheDataPayload;
}

/** 단일 캐시 데이터 조회 */
export interface FetchCacheData extends WebDefaultMessage<'FetchCacheData'> {
    data: FetchCacheDataPayload;
}

/** 단일 캐시 데이터 저장 (Upsert) */
export interface SaveCacheData extends WebDefaultMessage<'SaveCacheData'> {
    data: SaveCacheDataPayload;
}

/** 다수 캐시 데이터 저장 (Upsert) */
export interface SaveAllCacheData extends WebDefaultMessage<'SaveAllCacheData'> {
    data: SaveAllCacheDataPayload;
}

/** 단일 캐시 데이터 삭제 */
export interface DeleteCacheData extends WebDefaultMessage<'DeleteCacheData'> {
    data: DeleteCacheDataPayload;
}

/** 다수 캐시 데이터 삭제 */
export interface DeleteAllCacheData extends WebDefaultMessage<'DeleteAllCacheData'> {
    data: DeleteAllCacheDataPayload;
}

/** 전역 통합 검색 실행 */
export interface ExecuteGlobalSearch extends WebDefaultMessage<'ExecuteGlobalSearch'> {
    data: ExecuteGlobalSearchPayload;
}

/** Preference 조회 */
export interface FetchPreference extends WebDefaultMessage<'FetchPreference'> {
    data: {
        key: PreferenceKey;
    };
}

/** Preference 저장 */
export interface SavePreference extends WebDefaultMessage<'SavePreference'> {
    data: {
        key: PreferenceKey;
        value: any;
    };
}

/** Preference 삭제 */
export interface DeletePreference extends WebDefaultMessage<'DeletePreference'> {
    data: {
        key: PreferenceKey;
    };
}

/**
 * 외부 URL 열기 요청
 * Native에서 Linking.openURL()로 처리
 */
export interface OpenURL extends WebDefaultMessage<'OpenURL'> {
    data: {
        /** 열 URL */
        url: string;
    };
}

interface WebMessageMap {
    /**
     * 언어 설정 동기화
     */
    SetLanguage: SetLanguageData;
    /**
     * 테마 설정 동기화
     */
    SetTheme: SetThemeData;
    /**
     * TODO: Not Implement
     * @author dev@example.com
     */
    SetCanGoBack: SetCanGoBackData;
    ShowLoader: WebDefaultMessage<'ShowLoader'>;
    HideLoader: WebDefaultMessage<'HideLoader'>;
    SyncCredential: WebDefaultMessage<'SyncCredential'>;
    PopWebView: WebDefaultMessage<'PopWebView'>;
    OnScroll: OnScrollData;
    FetchDeviceInfo: WebDefaultMessage<'FetchDeviceInfo'>;

    /**
     * Control Device Event
     */
    OpenModal: OpenModal;
    CloseModal: WebDefaultMessage<'CloseModal'>;
    OpenSettings: OpenSettings;
    OpenShareSheet: OpenShareSheet;
    OpenDocument: OpenDocument;
    GetContacts: GetContacts;
    OpenCamera: OpenCamera;
    OpenPhotoLibrary: OpenPhotoLibrary;
    RequestPermission: RequestPermission;

    /**
     * Device Info Event
     */
    FetchSafeArea: WebDefaultMessage<'FetchSafeArea'>;
    FetchBackgroundStatus: WebDefaultMessage<'FetchBackgroundStatus'>;

    /**
     * FCM Event
     */
    FetchFcmToken: WebDefaultMessage<'FetchFcmToken'>;

    /**
     * IAP Event
     */
    FetchProducts: WebDefaultMessage<'FetchProducts'>;
    FetchCurrentPurchases: WebDefaultMessage<'FetchCurrentPurchases'>;
    Purchase: Purchase;
    FinishPurchaseTransaction: FinishPurchaseTransaction;
    OpenSubscriptionManagement: WebDefaultMessage<`OpenSubscriptionManagement`>;

    /**
     * Cache Event
     */
    FetchAllCacheData: FetchAllCacheData;
    FetchCacheData: FetchCacheData;
    SaveCacheData: SaveCacheData;
    SaveAllCacheData: SaveAllCacheData;
    DeleteCacheData: DeleteCacheData;
    DeleteAllCacheData: DeleteAllCacheData;

    /**
     * Search Event
     */
    ExecuteGlobalSearch: ExecuteGlobalSearch;

    /**
     * Preference Event
     */
    FetchPreference: FetchPreference;
    SavePreference: SavePreference;
    DeletePreference: DeletePreference;

    /**
     * OAuth Event
     */
    OAuthLogin: OAuthLogin;
    OAuthLogout: OAuthLogout;

    /**
     * External URL Event
     */
    OpenURL: OpenURL;
}

export type WebMessageData<T extends WebMessageType> = WebMessageMap[T];
export type WebMessage = WebMessageData<WebMessageType>;
