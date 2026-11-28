import type {
    ClearConfigValuePayload,
    DeletePreferencePayload,
    FetchPreferencePayload,
    FetchSessionOwnerPayload,
    OAuthLoginPayload,
    OAuthLogoutPayload,
    RuntimeCallPayload,
    RuntimeHelloPayload,
    RuntimeSubscribePayload,
    RuntimeUnsubscribePayload,
    SaveConfigValuePayload,
    SavePreferencePayload,
    SetDefaultSessionOwnerPayload,
    SetSessionOwnerPayload,
    StorageClearPayload,
    StorageGetPayload,
    StorageSavePayload,
} from '../model';

export type SessionAndStorageWebMessagePayloadMap = {
    StorageGet: StorageGetPayload;
    StorageSave: StorageSavePayload;
    StorageClear: StorageClearPayload;
    FetchPreference: FetchPreferencePayload;
    SavePreference: SavePreferencePayload;
    DeletePreference: DeletePreferencePayload;
    OAuthLogin: OAuthLoginPayload;
    OAuthLogout: OAuthLogoutPayload;
    SaveConfigValue: SaveConfigValuePayload;
    ClearConfigValue: ClearConfigValuePayload;
    RuntimeHello: RuntimeHelloPayload;
    RuntimeCall: RuntimeCallPayload;
    RuntimeSubscribe: RuntimeSubscribePayload;
    RuntimeUnsubscribe: RuntimeUnsubscribePayload;
    FetchSessionOwner: FetchSessionOwnerPayload;
    SetSessionOwner: SetSessionOwnerPayload;
    SetDefaultSessionOwner: SetDefaultSessionOwnerPayload;
};
