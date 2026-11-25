import type {
    AppIconOption as WireAppIconOption,
    AppMessageData,
    HapticKind as WireHapticKind,
    IapProductSubscription,
    ListPhotoAlbumsPayload,
    ListPhotosPayload,
    OAuthLoginProvider,
    OAuthLoginResult,
    OnFetchShareIntakePayload,
    OnFetchUrlMetadataPayload,
    OnGetContactsPayload,
    OnKeepLibraryVideoPayload,
    OnListPhotoAlbumsPayload,
    OnListPhotosPayload,
    OnManagePhotoSelectionPayload,
    OnNotificationPayload,
    OnPickAttachmentsPayload,
    OnPrepareVideoPayload,
    OnReadAttachmentPayload,
    OnReadPhotoPayload,
    OnReadVideoFramePayload,
    OnSaveFilePayload,
    OnSendSmsPayload,
    OnSubWebViewClosedPayload,
    OnUpdateStatusPayload,
    PendingReportInfo,
    PermissionStatus as WirePermissionStatus,
    PickAttachmentsPayload,
    PreferenceKey as WirePreferenceKey,
    ReadVideoFramePayload,
    SendBootMetricsPayload,
    ShowNotificationPayload,
    SubWebViewOpenScope as WireSubWebViewOpenScope,
    SubWebViewParams as WireSubWebViewParams,
    WebMessageResponse,
} from '@chatic/bridge-messages';
import type {
    AppIconOption,
    AttachmentContent,
    AttachmentPickRequest,
    BootMetricsSnapshot,
    ContactsReadout,
    HapticKind,
    KeptLibraryVideo,
    LocalBannerRequest,
    PendingReport,
    PermissionStatus,
    PhotoAlbums,
    PhotoAlbumsRequest,
    PhotoContent,
    PhotoPage,
    PhotoSelection,
    PhotosRequest,
    PickedAttachments,
    PreferenceKey,
    PreparedVideo,
    ProviderSignInOutcome,
    ReceivedNotification,
    SavedFile,
    SelfUpdateStatus,
    ShareIntake,
    SignInCredential,
    SignInProvider,
    SmsResult,
    StoreProduct,
    StorePurchase,
    SubWebViewClosed,
    SubWebViewOpenScope,
    SubWebViewParams,
    UrlMetadata,
    VideoFrame,
    VideoFrameRequest,
} from '@chatic/ports';

type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const same = <T extends true>(): T => true as T;

describe('host port domain types match the bridge payloads the adapters pass through', () => {
    it('appShell', () => {
        expect(same<Same<HapticKind, WireHapticKind>>()).toBe(true);
        expect(same<Same<PreferenceKey, WirePreferenceKey>>()).toBe(true);
        expect(same<Same<AppIconOption, WireAppIconOption>>()).toBe(true);
        expect(same<Same<SelfUpdateStatus, OnUpdateStatusPayload>>()).toBe(true);
    });

    it('checkout', () => {
        expect(same<Same<StoreProduct, IapProductSubscription>>()).toBe(true);
        expect(
            same<Same<StorePurchase, WebMessageResponse<'FetchCurrentPurchases'>['data']['purchases'][number]>>()
        ).toBe(true);
    });

    it('diagnostics', () => {
        expect(same<Same<PendingReport, PendingReportInfo>>()).toBe(true);
        expect(same<Same<BootMetricsSnapshot, SendBootMetricsPayload>>()).toBe(true);
    });

    it('files', () => {
        expect(same<Same<SavedFile, OnSaveFilePayload>>()).toBe(true);
        expect(same<Same<VideoFrameRequest, ReadVideoFramePayload>>()).toBe(true);
        expect(same<Same<VideoFrame, OnReadVideoFramePayload>>()).toBe(true);
    });

    it('links', () => {
        expect(same<Same<ShareIntake, OnFetchShareIntakePayload>>()).toBe(true);
        expect(same<Same<UrlMetadata, OnFetchUrlMetadataPayload>>()).toBe(true);
        expect(same<Same<ContactsReadout, OnGetContactsPayload>>()).toBe(true);
        expect(same<Same<SmsResult, OnSendSmsPayload>>()).toBe(true);
        expect(same<Same<SubWebViewClosed, OnSubWebViewClosedPayload>>()).toBe(true);
        expect(same<Same<SubWebViewOpenScope, WireSubWebViewOpenScope>>()).toBe(true);
        expect(same<Same<SubWebViewParams, WireSubWebViewParams>>()).toBe(true);
    });

    it('media', () => {
        expect(same<Same<AttachmentPickRequest, PickAttachmentsPayload>>()).toBe(true);
        expect(same<Same<PickedAttachments, OnPickAttachmentsPayload>>()).toBe(true);
        expect(same<Same<AttachmentContent, OnReadAttachmentPayload>>()).toBe(true);
        expect(same<Same<PhotoAlbumsRequest, ListPhotoAlbumsPayload>>()).toBe(true);
        expect(same<Same<PhotoAlbums, OnListPhotoAlbumsPayload>>()).toBe(true);
        expect(same<Same<PhotosRequest, ListPhotosPayload>>()).toBe(true);
        expect(same<Same<PhotoPage, OnListPhotosPayload>>()).toBe(true);
        expect(same<Same<PhotoContent, OnReadPhotoPayload>>()).toBe(true);
        expect(same<Same<KeptLibraryVideo, OnKeepLibraryVideoPayload>>()).toBe(true);
        expect(same<Same<PhotoSelection, OnManagePhotoSelectionPayload>>()).toBe(true);
        expect(same<Same<PreparedVideo, OnPrepareVideoPayload>>()).toBe(true);
        expect(same<Same<PermissionStatus, WirePermissionStatus>>()).toBe(true);
    });

    it('push', () => {
        expect(same<Same<ReceivedNotification, OnNotificationPayload>>()).toBe(true);
        expect(same<Same<LocalBannerRequest, ShowNotificationPayload>>()).toBe(true);
    });

    it('signIn', () => {
        expect(same<Same<SignInProvider, OAuthLoginProvider>>()).toBe(true);
        expect(same<Same<SignInCredential, OAuthLoginResult>>()).toBe(true);
        expect(same<Same<ProviderSignInOutcome, AppMessageData<'OnOAuthLogin'>>>()).toBe(true);
    });
});
