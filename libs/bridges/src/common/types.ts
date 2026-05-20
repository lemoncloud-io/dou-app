import type { AppMessageData, AppMessageType, EventMessageType } from '@chatic/app-messages'; // 실제 경로에 맞게 수정
import type { WebMessageData, WebMessageType } from '@chatic/app-messages'; // 실제 경로에 맞게 수정

// ======================================================================
// Alias & Common
// ======================================================================
export type RequestType = WebMessageType;
export type ResponseType = AppMessageType;
export type EventType = EventMessageType;

export type PayloadMap = Record<string, unknown>;

// ======================================================================
// Pair Relation Mapping (Request <-> Response 완벽한 1:1 매칭)
// ======================================================================
export interface BridgePairMap extends Record<WebMessageType, AppMessageType> {
    // 1. Device & System
    SetCanGoBack: 'OnSetCanGoBack';
    OpenModal: 'OnOpenModal';
    CloseModal: 'OnCloseModal';
    OpenSettings: 'OnOpenSettings';
    OpenShareSheet: 'OnOpenShareSheet';
    GetContacts: 'OnGetContacts';
    OpenDocument: 'OnOpenDocument';
    OpenCamera: 'OnOpenCamera';
    OpenPhotoLibrary: 'OnOpenPhotoLibrary';
    FetchSafeArea: 'OnFetchSafeArea';
    FetchBackgroundStatus: 'OnBackgroundStatusChanged';
    RequestPermission: 'OnRequestPermission';
    OpenURL: 'OnOpenURL';
    FetchAppIcon: 'OnFetchAppIcon';
    FetchAppIconList: 'OnFetchAppIconList';
    ChangeAppIcon: 'OnChangeAppIcon';

    // 2. Notification
    FetchFcmToken: 'OnFetchFcmToken';

    // 3. IAP
    FetchProducts: 'OnFetchProducts';
    FetchCurrentPurchases: 'OnFetchCurrentPurchases';
    Purchase: 'OnPurchase';
    FinishPurchaseTransaction: 'OnFinishPurchaseTransaction';
    OpenSubscriptionManagement: 'OnOpenSubscriptionManagement';

    // 4. Cache
    FetchCacheData: 'OnFetchCacheData';
    FetchAllCacheData: 'OnFetchAllCacheData';
    SaveCacheData: 'OnSaveCacheData';
    SaveAllCacheData: 'OnSaveAllCacheData';
    DeleteCacheData: 'OnDeleteCacheData';
    DeleteAllCacheData: 'OnDeleteAllCacheData';
    ClearCacheData: 'OnClearCacheData';
    SearchGlobalCacheData: 'OnSearchGlobalCacheData';

    // 5. Preference
    FetchPreference: 'OnFetchPreference';
    SavePreference: 'OnSavePreference';
    DeletePreference: 'OnDeletePreference';

    // 6. Auth
    OAuthLogin: 'OnOAuthLogin';
    OAuthLogout: 'OnOAuthLogout';

    // 7. Common & Others
    FetchAppLogBuffer: 'OnFetchAppLogBuffer';
    PollAppLogBuffer: 'OnPollAppLogBuffer';
    ClearAppLogBuffer: 'OnClearAppLogBuffer';
    FetchAppLogBufferSize: 'OnFetchAppLogBufferSize';
    SendLog: 'OnSendLog';
    Ping: 'Pong';
}

export type BridgeResponseMessage<K extends WebMessageType> = AppMessageData<BridgePairMap[K]>;
export type RequestMessage = WebMessageData<WebMessageType>;
export type EventMessage = AppMessageData<EventMessageType>;
export type ResponseMessage = BridgeResponseMessage<WebMessageType>;
