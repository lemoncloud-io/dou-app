import type {
    OnClearConfigValuePayload,
    OnDeletePreferencePayload,
    OnFetchPreferencePayload,
    OnFetchSessionOwnerPayload,
    OnOAuthLoginPayload,
    OnOAuthLogoutPayload,
    OnRuntimeCallPayload,
    OnRuntimeEventPayload,
    OnRuntimeHelloPayload,
    OnRuntimeSessionChangedPayload,
    OnRuntimeSubscribePayload,
    OnRuntimeUnsubscribePayload,
    OnSaveConfigValuePayload,
    OnSavePreferencePayload,
    OnSetDefaultSessionOwnerPayload,
    OnSetSessionOwnerPayload,
    OnStorageClearPayload,
    OnStorageGetPayload,
    OnStorageSavePayload,
} from '../model';

export type SessionAndStorageAppMessageDataMap = {
    OnStorageGet: OnStorageGetPayload;
    OnStorageSave: OnStorageSavePayload;
    OnStorageClear: OnStorageClearPayload;
    OnFetchPreference: OnFetchPreferencePayload;
    OnSavePreference: OnSavePreferencePayload;
    OnDeletePreference: OnDeletePreferencePayload;
    OnOAuthLogin: OnOAuthLoginPayload;
    OnOAuthLogout: OnOAuthLogoutPayload;
    OnSaveConfigValue: OnSaveConfigValuePayload;
    OnClearConfigValue: OnClearConfigValuePayload;
    OnRuntimeHello: OnRuntimeHelloPayload;
    OnRuntimeCall: OnRuntimeCallPayload;
    OnRuntimeSubscribe: OnRuntimeSubscribePayload;
    OnRuntimeUnsubscribe: OnRuntimeUnsubscribePayload;
    OnRuntimeEvent: OnRuntimeEventPayload;
    OnRuntimeSessionChanged: OnRuntimeSessionChangedPayload;
    OnFetchSessionOwner: OnFetchSessionOwnerPayload;
    OnSetSessionOwner: OnSetSessionOwnerPayload;
    OnSetDefaultSessionOwner: OnSetDefaultSessionOwnerPayload;
};
