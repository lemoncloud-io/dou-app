import type {
    ChangeAppIconPayload,
    ClearCacheDataPayload,
    DeleteAllCacheDataPayload,
    DeleteCacheDataPayload,
    DeletePreferencePayload,
    FetchAllCacheDataPayload,
    FetchAppLogBufferPayload,
    FetchCacheDataPayload,
    FetchPreferencePayload,
    FinishPurchaseTransactionPayload,
    OAuthLoginPayload,
    OAuthLogoutPayload,
    OpenCameraPayload,
    OpenDocumentPayload,
    OpenModalPayload,
    OpenPhotoLibraryPayload,
    OpenShareSheetPayload,
    OpenURLPayload,
    PingPayload,
    PollAppLogBufferPayload,
    PurchasePayload,
    RequestPermissionPayload,
    SaveAllCacheDataPayload,
    SaveCacheDataPayload,
    SavePreferencePayload,
    SearchGlobalCacheDataPayload,
    SendLogPayload,
    SetCanGoBackPayload,
} from './model';

export const WebMessageTypes = {
    // 1. Device & System
    SetCanGoBack: 'SetCanGoBack',
    OpenModal: 'OpenModal',
    CloseModal: 'CloseModal',
    OpenSettings: 'OpenSettings',
    OpenShareSheet: 'OpenShareSheet',
    GetContacts: 'GetContacts',
    OpenDocument: 'OpenDocument',
    OpenCamera: 'OpenCamera',
    OpenPhotoLibrary: 'OpenPhotoLibrary',
    FetchSafeArea: 'FetchSafeArea',
    FetchBackgroundStatus: 'FetchBackgroundStatus',
    RequestPermission: 'RequestPermission',
    OpenURL: 'OpenURL',
    FetchAppIcon: 'FetchAppIcon',
    FetchAppIconList: 'FetchAppIconList',
    ChangeAppIcon: 'ChangeAppIcon',

    // 2. Notification
    FetchFcmToken: 'FetchFcmToken',

    // 3. IAP
    FetchProducts: 'FetchProducts',
    FetchCurrentPurchases: 'FetchCurrentPurchases',
    Purchase: 'Purchase',
    FinishPurchaseTransaction: 'FinishPurchaseTransaction',
    OpenSubscriptionManagement: 'OpenSubscriptionManagement',

    // 4. CacheData
    FetchCacheData: 'FetchCacheData',
    FetchAllCacheData: 'FetchAllCacheData',
    SaveCacheData: 'SaveCacheData',
    SaveAllCacheData: 'SaveAllCacheData',
    DeleteCacheData: 'DeleteCacheData',
    DeleteAllCacheData: 'DeleteAllCacheData',
    ClearCacheData: 'ClearCacheData',
    SearchGlobalCacheData: 'SearchGlobalCacheData',

    // 5. Preference
    FetchPreference: 'FetchPreference',
    SavePreference: 'SavePreference',
    DeletePreference: 'DeletePreference',

    // 6. Auth
    OAuthLogin: 'OAuthLogin',
    OAuthLogout: 'OAuthLogout',

    // 7. Common & Others
    FetchAppLogBuffer: 'FetchAppLogBuffer',
    PollAppLogBuffer: 'PollAppLogBuffer',
    ClearAppLogBuffer: 'ClearAppLogBuffer',
    FetchAppLogBufferSize: 'FetchAppLogBufferSize',
    SendLog: 'SendLog',
    Ping: 'Ping',
} as const;

export type WebMessageType = (typeof WebMessageTypes)[keyof typeof WebMessageTypes];

export interface WebMessageMap {
    // 1. Device & System
    SetCanGoBack: SetCanGoBack;
    OpenModal: OpenModal;
    CloseModal: CloseModal;
    OpenSettings: OpenSettings;
    OpenShareSheet: OpenShareSheet;
    GetContacts: GetContacts;
    OpenDocument: OpenDocument;
    OpenCamera: OpenCamera;
    OpenPhotoLibrary: OpenPhotoLibrary;
    FetchSafeArea: FetchSafeArea;
    FetchBackgroundStatus: FetchBackgroundStatus;
    RequestPermission: RequestPermission;
    OpenURL: OpenURL;
    FetchAppIcon: FetchAppIcon;
    FetchAppIconList: FetchAppIconList;
    ChangeAppIcon: ChangeAppIcon;

    // 2. Notification
    FetchFcmToken: WebDefaultMessage<'FetchFcmToken'>;

    // 3. IAP
    FetchProducts: FetchProducts;
    FetchCurrentPurchases: FetchCurrentPurchases;
    Purchase: Purchase;
    FinishPurchaseTransaction: FinishPurchaseTransaction;
    OpenSubscriptionManagement: OpenSubscriptionManagement;

    // 4. Cache
    FetchCacheData: FetchCacheData;
    FetchAllCacheData: FetchAllCacheData;
    SaveCacheData: SaveCacheData;
    SaveAllCacheData: SaveAllCacheData;
    DeleteCacheData: DeleteCacheData;
    DeleteAllCacheData: DeleteAllCacheData;
    ClearCacheData: ClearCacheData;
    SearchGlobalCacheData: SearchGlobalCacheData;

    // 5. Preference
    FetchPreference: FetchPreference;
    SavePreference: SavePreference;
    DeletePreference: DeletePreference;

    // 6. Auth
    OAuthLogin: OAuthLogin;
    OAuthLogout: OAuthLogout;

    // 7. Common & Others
    FetchAppLogBuffer: FetchAppLogBuffer;
    PollAppLogBuffer: PollAppLogBuffer;
    ClearAppLogBuffer: ClearAppLogBuffer;
    FetchAppLogBufferSize: FetchAppLogBufferSize;
    SendLog: SendLog;
    Ping: Ping;
}

export type WebMessageData<T extends WebMessageType> = WebMessageMap[T];
export type WebMessage = WebMessageData<WebMessageType>;

export interface WebDefaultMessage<T extends WebMessageType> {
    type: T;
    nonce?: string;
}

// ----------------------------------------------------------------------
// 1. Device & System Interfaces
// ----------------------------------------------------------------------
export interface SetCanGoBack extends WebDefaultMessage<'SetCanGoBack'> {
    data: SetCanGoBackPayload;
}

export interface OpenModal extends WebDefaultMessage<'OpenModal'> {
    data: OpenModalPayload;
}

/** 네이티브 모달 닫기 요청 */
export interface CloseModal extends WebDefaultMessage<'CloseModal'> {}

export interface OpenSettings extends WebDefaultMessage<'OpenSettings'> {} // payload 없음
export interface OpenShareSheet extends WebDefaultMessage<'OpenShareSheet'> {
    data: OpenShareSheetPayload;
}

export interface OpenDocument extends WebDefaultMessage<'OpenDocument'> {
    data: OpenDocumentPayload;
}

export interface GetContacts extends WebDefaultMessage<'GetContacts'> {} // payload 없음
export interface OpenCamera extends WebDefaultMessage<'OpenCamera'> {
    data: OpenCameraPayload;
}

export interface OpenPhotoLibrary extends WebDefaultMessage<'OpenPhotoLibrary'> {
    data: OpenPhotoLibraryPayload;
}

export interface RequestPermission extends WebDefaultMessage<'RequestPermission'> {
    data: RequestPermissionPayload;
}

/** SafeArea 정보 요청 */
export interface FetchSafeArea extends WebDefaultMessage<'FetchSafeArea'> {}

/** 앱 포그라운드/백그라운드 상태 정보 요청 */
export interface FetchBackgroundStatus extends WebDefaultMessage<'FetchBackgroundStatus'> {}

/** 외부 URL 열기 (Native에서 Linking.openURL 처리) */
export interface OpenURL extends WebDefaultMessage<'OpenURL'> {
    data: OpenURLPayload;
}

/** 현재 앱 아이콘 정보 조회 */
export interface FetchAppIcon extends WebDefaultMessage<'FetchAppIcon'> {}

/** 사용 가능한 앱 아이콘 목록 요청 */
export interface FetchAppIconList extends WebDefaultMessage<'FetchAppIconList'> {}

/** 앱 아이콘 변경 */
export interface ChangeAppIcon extends WebDefaultMessage<'ChangeAppIcon'> {
    data: ChangeAppIconPayload;
}

// ----------------------------------------------------------------------
// 2. Notification Interfaces
// ----------------------------------------------------------------------
/** FCM 토큰 요청 */
export interface FetchFcmToken extends WebDefaultMessage<'FetchFcmToken'> {}

// ----------------------------------------------------------------------
// 3. IAP Interfaces
// ----------------------------------------------------------------------
/** IAP 상품 목록 요청 */
export interface FetchProducts extends WebDefaultMessage<'FetchProducts'> {}

/** 현재 구매/구독중인 IAP 항목 요청 */
export interface FetchCurrentPurchases extends WebDefaultMessage<'FetchCurrentPurchases'> {}

export interface Purchase extends WebDefaultMessage<'Purchase'> {
    data: PurchasePayload;
}

export interface FinishPurchaseTransaction extends WebDefaultMessage<'FinishPurchaseTransaction'> {
    data: FinishPurchaseTransactionPayload;
}

/** 구독 관리 화면(App Store/Play Store) 열기 요청 */
export interface OpenSubscriptionManagement extends WebDefaultMessage<'OpenSubscriptionManagement'> {}

// ----------------------------------------------------------------------
// 4. Cache Interfaces
// ----------------------------------------------------------------------
export interface FetchCacheData extends WebDefaultMessage<'FetchCacheData'> {
    data: FetchCacheDataPayload;
}

export interface FetchAllCacheData extends WebDefaultMessage<'FetchAllCacheData'> {
    data: FetchAllCacheDataPayload;
}

export interface SaveCacheData extends WebDefaultMessage<'SaveCacheData'> {
    data: SaveCacheDataPayload;
}

export interface SaveAllCacheData extends WebDefaultMessage<'SaveAllCacheData'> {
    data: SaveAllCacheDataPayload;
}

export interface DeleteCacheData extends WebDefaultMessage<'DeleteCacheData'> {
    data: DeleteCacheDataPayload;
}

export interface DeleteAllCacheData extends WebDefaultMessage<'DeleteAllCacheData'> {
    data: DeleteAllCacheDataPayload;
}

export interface ClearCacheData extends WebDefaultMessage<'ClearCacheData'> {
    data: ClearCacheDataPayload;
}

export interface SearchGlobalCacheData extends WebDefaultMessage<'SearchGlobalCacheData'> {
    data: SearchGlobalCacheDataPayload;
}

// ----------------------------------------------------------------------
// 5. Preference Interfaces
// ----------------------------------------------------------------------
export interface FetchPreference extends WebDefaultMessage<'FetchPreference'> {
    data: FetchPreferencePayload;
}

export interface SavePreference extends WebDefaultMessage<'SavePreference'> {
    data: SavePreferencePayload;
}

export interface DeletePreference extends WebDefaultMessage<'DeletePreference'> {
    data: DeletePreferencePayload;
}

// ----------------------------------------------------------------------
// 6. Auth Interfaces
// ----------------------------------------------------------------------
export interface OAuthLogin extends WebDefaultMessage<'OAuthLogin'> {
    data: OAuthLoginPayload;
}

export interface OAuthLogout extends WebDefaultMessage<'OAuthLogout'> {
    data: OAuthLogoutPayload;
}

// ----------------------------------------------------------------------
// 7. Common & Others Interfaces
// ----------------------------------------------------------------------
export interface FetchAppLogBuffer extends WebDefaultMessage<'FetchAppLogBuffer'> {
    data: FetchAppLogBufferPayload;
}

export interface PollAppLogBuffer extends WebDefaultMessage<'PollAppLogBuffer'> {
    data: PollAppLogBufferPayload;
}

export interface ClearAppLogBuffer extends WebDefaultMessage<'ClearAppLogBuffer'> {}

export interface FetchAppLogBufferSize extends WebDefaultMessage<'FetchAppLogBufferSize'> {}

export interface SendLog extends WebDefaultMessage<'SendLog'> {
    data: SendLogPayload;
}

export interface Ping extends WebDefaultMessage<'Ping'> {
    data: PingPayload;
}
