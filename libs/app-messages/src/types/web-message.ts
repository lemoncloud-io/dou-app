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
import type { BaseMessage } from './types';

/** 메시지 타입과 해당 Payload 타입을 매핑하는 인터페이스입니다. Payload가 없는 경우 never로 정의합니다. */
export interface WebMessagePayloadMap {
    // 1. Device & System
    SetCanGoBack: SetCanGoBackPayload;
    OpenModal: OpenModalPayload;
    CloseModal: never;
    OpenSettings: never;
    OpenShareSheet: OpenShareSheetPayload;
    GetContacts: never;
    OpenDocument: OpenDocumentPayload;
    OpenCamera: OpenCameraPayload;
    OpenPhotoLibrary: OpenPhotoLibraryPayload;
    FetchSafeArea: never;
    FetchBackgroundStatus: never;
    RequestPermission: RequestPermissionPayload;
    OpenURL: OpenURLPayload;
    FetchAppIcon: never;
    FetchAppIconList: never;
    ChangeAppIcon: ChangeAppIconPayload;

    // 2. Notification
    FetchFcmToken: never;

    // 3. IAP
    FetchProducts: never;
    FetchCurrentPurchases: never;
    Purchase: PurchasePayload;
    FinishPurchaseTransaction: FinishPurchaseTransactionPayload;
    OpenSubscriptionManagement: never;

    // 4. Cache
    FetchCacheData: FetchCacheDataPayload;
    FetchAllCacheData: FetchAllCacheDataPayload;
    SaveCacheData: SaveCacheDataPayload;
    SaveAllCacheData: SaveAllCacheDataPayload;
    DeleteCacheData: DeleteCacheDataPayload;
    DeleteAllCacheData: DeleteAllCacheDataPayload;
    ClearCacheData: ClearCacheDataPayload;
    SearchGlobalCacheData: SearchGlobalCacheDataPayload;

    // 5. Preference
    FetchPreference: FetchPreferencePayload;
    SavePreference: SavePreferencePayload;
    DeletePreference: DeletePreferencePayload;

    // 6. Auth
    OAuthLogin: OAuthLoginPayload;
    OAuthLogout: OAuthLogoutPayload;

    // 7. Common & Others
    FetchAppLogBuffer: FetchAppLogBufferPayload;
    PollAppLogBuffer: PollAppLogBufferPayload;
    ClearAppLogBuffer: never;
    FetchAppLogBufferSize: never;
    SendLog: SendLogPayload;
    Ping: PingPayload;
}

/** WebMessagePayloadMap의 Key들을 조합하여 가능한 모든 웹 메시지 타입(String Union)을 자동 생성합니다. */
export type WebMessageType = keyof WebMessagePayloadMap;

/** * WebMessagePayloadMap을 기반으로 payload 타입을 자동 추론하는 메시지 규격입니다.
 * Payload가 never인 경우 payload 속성을 제외(또는 undefined) 처리합니다.
 */
export type WebDefaultMessage<T extends WebMessageType> = BaseMessage & {
    type: T;
} & (WebMessagePayloadMap[T] extends never ? { data?: never } : { data: WebMessagePayloadMap[T] });

export type WebMessageData<T extends WebMessageType> = WebDefaultMessage<T>;

/** 가능한 모든 웹 메시지 타입(Union)을 나타냅니다. */
export type WebMessage = {
    [K in WebMessageType]: WebDefaultMessage<K>;
}[WebMessageType];
