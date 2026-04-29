/**
 * App Message:
 * App(Native)에서 Web(WebView)으로 전달하는 메시지 규약
 */

import type {
    OnUpdateDeviceInfoPayload,
    OnFetchSafeAreaPayload,
    OnBackgroundStatusChangedPayload,
    OnOpenShareSheetPayload,
    OnOpenDocumentPayload,
    OnGetContactsPayload,
    OnOpenCameraPayload,
    OnOpenPhotoLibraryPayload,
    OnRequestPermissionPayload,
    OnFetchFcmTokenPayload,
    OnNotificationPayload,
    OnFetchProductsPayload,
    OnFetchCurrentPurchasesPayload,
    OnPurchaseSuccessPayload,
    OnPurchaseErrorPayload,
    OnFinishPurchaseTransactionPayload,
    OnFetchAllCacheDataPayload,
    OnFetchCacheDataPayload,
    OnSaveCacheDataPayload,
    OnSaveAllCacheDataPayload,
    OnDeleteCacheDataPayload,
    OnDeleteAllCacheDataPayload,
    OnClearCacheDataPayload,
    OnSearchGlobalCacheDataPayload,
    OnFetchPreferencePayload,
    OnSavePreferencePayload,
    OnDeletePreferencePayload,
    OnOAuthLoginPayload,
    OnOAuthLogoutPayload,
    OnFetchAppLogBufferPayload,
    OnPollAppLogBufferPayload,
    OnClearAppLogBufferPayload,
    OnFetchAppLogBufferSizePayload,
} from './model';

// ======================================================================
// Message Types
// ======================================================================
export const AppMessageTypes = {
    // 1. Device & System
    OnSuccessSyncCredential: 'OnSuccessSyncCredential',
    OnUpdateDeviceInfo: 'OnUpdateDeviceInfo',
    OnFetchSafeArea: 'OnFetchSafeArea',
    OnBackgroundStatusChanged: 'OnBackgroundStatusChanged',
    OnCloseModal: 'OnCloseModal',
    OnOpenShareSheet: 'OnOpenShareSheet',
    OnBackPressed: 'OnBackPressed',
    OnOpenDocument: 'OnOpenDocument',
    OnGetContacts: 'OnGetContacts',
    OnOpenCamera: 'OnOpenCamera',
    OnOpenPhotoLibrary: 'OnOpenPhotoLibrary',
    OnRequestPermission: 'OnRequestPermission',

    // 2. Notification
    OnFetchFcmToken: 'OnFetchFcmToken',
    OnReceiveNotification: 'OnReceiveNotification',
    OnOpenNotification: 'OnOpenNotification',

    // 3. IAP
    OnFetchCurrentPurchases: 'OnFetchCurrentPurchases',
    OnFetchProducts: 'OnFetchProducts',
    OnPurchaseSuccess: 'OnPurchaseSuccess',
    OnPurchaseError: 'OnPurchaseError',
    OnFinishPurchaseTransaction: 'OnFinishPurchaseTransaction',

    // 4. CacheData
    OnFetchAllCacheData: 'OnFetchAllCacheData',
    OnFetchCacheData: 'OnFetchCacheData',
    OnSaveCacheData: 'OnSaveCacheData',
    OnSaveAllCacheData: 'OnSaveAllCacheData',
    OnDeleteCacheData: 'OnDeleteCacheData',
    OnDeleteAllCacheData: 'OnDeleteAllCacheData',
    OnClearCacheData: 'OnClearCacheData',
    OnSearchGlobalCacheData: 'OnSearchGlobalCacheData',

    // 5. Preference
    OnFetchPreference: 'OnFetchPreference',
    OnSavePreference: 'OnSavePreference',
    OnDeletePreference: 'OnDeletePreference',

    // 6. Auth
    OnOAuthLogin: 'OnOAuthLogin',
    OnOAuthLogout: 'OnOAuthLogout',

    // 7. Common & Others
    OnFetchAppLogBuffer: 'OnFetchAppLogBuffer',
    OnPollAppLogBuffer: 'OnPollAppLogBuffer',
    OnClearAppLogBuffer: 'OnClearAppLogBuffer',
    OnFetchAppLogBufferSize: 'OnFetchAppLogBufferSize',
} as const;

export type AppMessageType = (typeof AppMessageTypes)[keyof typeof AppMessageTypes];

// ======================================================================
// Message Map Definition
// ======================================================================
export interface AppMessageMap {
    // 1. Device & System
    OnSuccessSyncCredential: AppDefaultMessage<'OnSuccessSyncCredential'>;
    OnUpdateDeviceInfo: OnUpdateDeviceInfo;
    OnFetchSafeArea: OnFetchSafeArea;
    OnBackgroundStatusChanged: OnBackgroundStatusChanged;
    OnCloseModal: AppDefaultMessage<'OnCloseModal'>;
    OnOpenShareSheet: OnOpenShareSheet;
    OnBackPressed: OnBackPressed;
    OnOpenDocument: OnOpenDocument;
    OnGetContacts: OnGetContacts;
    OnOpenCamera: OnOpenCamera;
    OnOpenPhotoLibrary: OnOpenPhotoLibrary;
    OnRequestPermission: OnRequestPermission;

    // 2. Notification
    OnFetchFcmToken: OnFetchFcmToken;
    OnReceiveNotification: OnReceiveNotification;
    OnOpenNotification: OnOpenNotification;

    // 3. IAP
    OnFetchProducts: OnFetchProducts;
    OnFetchCurrentPurchases: OnFetchCurrentPurchases;
    OnPurchaseSuccess: OnPurchaseSuccess;
    OnPurchaseError: OnPurchaseError;
    OnFinishPurchaseTransaction: OnFinishPurchaseTransaction;

    // 4. Cache
    OnFetchAllCacheData: OnFetchAllCacheData;
    OnFetchCacheData: OnFetchCacheData;
    OnSaveCacheData: OnSaveCacheData;
    OnSaveAllCacheData: OnSaveAllCacheData;
    OnDeleteCacheData: OnDeleteCacheData;
    OnDeleteAllCacheData: OnDeleteAllCacheData;
    OnClearCacheData: OnClearCacheData;
    OnSearchGlobalCacheData: OnSearchGlobalCacheData;

    // 5. Preference
    OnFetchPreference: OnFetchPreference;
    OnSavePreference: OnSavePreference;
    OnDeletePreference: OnDeletePreference;

    // 6. Auth
    OnOAuthLogin: OnOAuthLogin;
    OnOAuthLogout: OnOAuthLogout;

    // 7. Common & Others
    OnFetchAppLogBuffer: OnFetchAppLogBuffer;
    OnPollAppLogBuffer: OnPollAppLogBuffer;
    OnClearAppLogBuffer: OnClearAppLogBuffer;
    OnFetchAppLogBufferSize: OnFetchAppLogBufferSize;
}

export type AppMessageData<T extends AppMessageType> = AppMessageMap[T];
export type AppMessage = AppMessageData<AppMessageType>;

/** * App Message 공통 기반 인터페이스
 */
export interface AppDefaultMessage<T extends AppMessageType> {
    type: T;
    /** Web에서 요청 시 생성하여 보낸 nonce(고유 ID)를 그대로 에코(Echo) 반환 */
    nonce?: string;
}

// ======================================================================
// 1. Device & System Interfaces
// ======================================================================
/** 디바이스 및 버전 정보 업데이트 */
export interface OnUpdateDeviceInfo extends AppDefaultMessage<'OnUpdateDeviceInfo'> {
    data: OnUpdateDeviceInfoPayload;
}
/** 노치, 홈 인디케이터 등 안전 영역 정보 반환 */
export interface OnFetchSafeArea extends AppDefaultMessage<'OnFetchSafeArea'> {
    data: OnFetchSafeAreaPayload;
}
/** 앱 백그라운드/포그라운드 상태 변경 알림 */
export interface OnBackgroundStatusChanged extends AppDefaultMessage<'OnBackgroundStatusChanged'> {
    data: OnBackgroundStatusChangedPayload;
}
/** 공유 시트 실행 결과 반환 */
export interface OnOpenShareSheet extends AppDefaultMessage<'OnOpenShareSheet'> {
    data: OnOpenShareSheetPayload;
}
/** 네이티브 물리적/제스처 뒤로가기 발생 알림 */
export interface OnBackPressed extends AppDefaultMessage<'OnBackPressed'> {}
/** 기기 문서/파일 선택 결과 반환 */
export interface OnOpenDocument extends AppDefaultMessage<'OnOpenDocument'> {
    data: OnOpenDocumentPayload;
}
/** 기기 주소록 연락처 목록 반환 */
export interface OnGetContacts extends AppDefaultMessage<'OnGetContacts'> {
    data: OnGetContactsPayload;
}
/** 카메라 촬영 결과 반환 */
export interface OnOpenCamera extends AppDefaultMessage<'OnOpenCamera'> {
    data: OnOpenCameraPayload;
}
/** 사진 라이브러리 선택 결과 반환 */
export interface OnOpenPhotoLibrary extends AppDefaultMessage<'OnOpenPhotoLibrary'> {
    data: OnOpenPhotoLibraryPayload;
}
/** OS 권한 요청 결과 반환 */
export interface OnRequestPermission extends AppDefaultMessage<'OnRequestPermission'> {
    data: OnRequestPermissionPayload;
}

// ======================================================================
// 2. Notification Interfaces
// ======================================================================
/** 푸시 알림용 FCM 토큰 반환 */
export interface OnFetchFcmToken extends AppDefaultMessage<'OnFetchFcmToken'> {
    data: OnFetchFcmTokenPayload;
}
/** 포그라운드 상태에서 푸시 알림 수신 이벤트 */
export interface OnReceiveNotification extends AppDefaultMessage<'OnReceiveNotification'> {
    data: OnNotificationPayload;
}
/** 알림을 클릭하여 앱이 열렸을 때의 이벤트 */
export interface OnOpenNotification extends AppDefaultMessage<'OnOpenNotification'> {
    data: OnNotificationPayload;
}

// ======================================================================
// 3. IAP Interfaces
// ======================================================================
/** 현재 구독/결제 중인 항목 목록 반환 */
export interface OnFetchCurrentPurchases extends AppDefaultMessage<'OnFetchCurrentPurchases'> {
    data: OnFetchCurrentPurchasesPayload;
}
/** 결제 가능한 상품 목록 반환 */
export interface OnFetchProducts extends AppDefaultMessage<'OnFetchProducts'> {
    data: OnFetchProductsPayload;
}
/** 결제 성공 트랜잭션 반환 */
export interface OnPurchaseSuccess extends AppDefaultMessage<'OnPurchaseSuccess'> {
    data: OnPurchaseSuccessPayload;
}
/** 결제 실패/에러 정보 반환 */
export interface OnPurchaseError extends AppDefaultMessage<'OnPurchaseError'> {
    data: OnPurchaseErrorPayload;
}
/** 결제 영수증 검증 및 트랜잭션 종료 완료 처리 반환 */
export interface OnFinishPurchaseTransaction extends AppDefaultMessage<'OnFinishPurchaseTransaction'> {
    data: OnFinishPurchaseTransactionPayload;
}

// ======================================================================
// 4. Cache Interfaces
// ======================================================================
/** 다수 캐시 데이터 조회 반환 */
export interface OnFetchAllCacheData extends AppDefaultMessage<'OnFetchAllCacheData'> {
    data: OnFetchAllCacheDataPayload;
}
/** 단일 캐시 데이터 조회 반환 */
export interface OnFetchCacheData extends AppDefaultMessage<'OnFetchCacheData'> {
    data: OnFetchCacheDataPayload;
}
/** 단일 캐시 데이터 저장 완료 (실패 시 id: null) */
export interface OnSaveCacheData extends AppDefaultMessage<'OnSaveCacheData'> {
    data: OnSaveCacheDataPayload;
}
/** 다수 캐시 데이터 저장 완료 (성공한 ids 반환) */
export interface OnSaveAllCacheData extends AppDefaultMessage<'OnSaveAllCacheData'> {
    data: OnSaveAllCacheDataPayload;
}
/** 단일 캐시 데이터 삭제 완료 */
export interface OnDeleteCacheData extends AppDefaultMessage<'OnDeleteCacheData'> {
    data: OnDeleteCacheDataPayload;
}
/** 다수 캐시 데이터 삭제 완료 */
export interface OnDeleteAllCacheData extends AppDefaultMessage<'OnDeleteAllCacheData'> {
    data: OnDeleteAllCacheDataPayload;
}
/** 특정 도메인 전체 데이터 초기화 완료 */
export interface OnClearCacheData extends AppDefaultMessage<'OnClearCacheData'> {
    data: OnClearCacheDataPayload;
}
/** 전역 통합 검색 결과 반환 */
export interface OnSearchGlobalCacheData extends AppDefaultMessage<'OnSearchGlobalCacheData'> {
    data: OnSearchGlobalCacheDataPayload;
}

// ======================================================================
// 5. Preference Interfaces
// ======================================================================
export interface OnFetchPreference extends AppDefaultMessage<'OnFetchPreference'> {
    data: OnFetchPreferencePayload;
}
export interface OnSavePreference extends AppDefaultMessage<'OnSavePreference'> {
    data: OnSavePreferencePayload;
}
export interface OnDeletePreference extends AppDefaultMessage<'OnDeletePreference'> {
    data: OnDeletePreferencePayload;
}

// ======================================================================
// 6. Auth Interfaces
// ======================================================================
/** OAuth 로그인 성공/실패 결과 반환 */
export interface OnOAuthLogin extends AppDefaultMessage<'OnOAuthLogin'> {
    data: OnOAuthLoginPayload;
}
/** OAuth 로그아웃 완료 반환 */
export interface OnOAuthLogout extends AppDefaultMessage<'OnOAuthLogout'> {
    data: OnOAuthLogoutPayload;
}

// ======================================================================
// 7. Common & Others Interfaces
// ======================================================================

/** 로그 버퍼 조회 응답 */
export interface OnFetchAppLogBuffer extends AppDefaultMessage<'OnFetchAppLogBuffer'> {
    data: OnFetchAppLogBufferPayload;
}

/** 로그 버퍼 poll(조회+제거) 응답 */
export interface OnPollAppLogBuffer extends AppDefaultMessage<'OnPollAppLogBuffer'> {
    data: OnPollAppLogBufferPayload;
}

/** 로그 버퍼 clear 응답 */
export interface OnClearAppLogBuffer extends AppDefaultMessage<'OnClearAppLogBuffer'> {
    data: OnClearAppLogBufferPayload;
}

/** 로그 버퍼 현재 크기 조회 응답 */
export interface OnFetchAppLogBufferSize extends AppDefaultMessage<'OnFetchAppLogBufferSize'> {
    data: OnFetchAppLogBufferSizePayload;
}
