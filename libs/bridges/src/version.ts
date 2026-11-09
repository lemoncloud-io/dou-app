/**
 * Bridge runtime version exposed through WebAppReady, request metadata, and bridge errors.
 *
 * Keep this value easy to find and bump it whenever the WebView wire contract or bridge
 * capability surface changes. App release version and npm package version can differ from
 * this runtime protocol version.
 */
// 2.2.0: added ShowNotification (web -> app) for desktop OS notifications.
// 2.3.0: StartFileTransfer accepts `download`; added SaveToPhotoLibrary and ShareFile (web -> app).
//        TriggerHaptic landed while 2.2.0 was current, so this is the first version that has it.
// 2.4.0: added PickAttachments, PrepareVideo, OpenFile and SaveFile (web -> app); SaveToPhotoLibrary
//        takes MP4 and ShareFile the server's document formats.
// 2.5.0: added KeepLibraryVideo and ReadVideoFrame (web -> app); ListPhotos and ListPhotoAlbums take
//        `mediaTypes`, and a library item carries `mediaType` and `durationMs`.
// 2.6.0: the WebAppReady reply lists the requests this host has handlers for, not the whole map; the
//        host answers Ping itself.
// 2.7.0: removed OpenModal, CloseModal, ShowLoader, HideLoader, SyncCredential and PopWebView from the
//        vocabulary (web -> app), because no web build sent them and no shell handled them.
// 2.8.0: removed FetchSafeArea, FetchBackgroundStatus and the four *AppLogBuffer requests (web -> app)
//        with their replies, because no web build sends them any more; the phone shell stops
//        answering them and its handshake stops listing them. OnBackgroundStatusChanged stays a push.
//        A deliberately loaded custom bundle (a non-PROD phone zip, the desktop custom UI) may be
//        older and still send one; it gets NOT_FOUND.
// 2.9.0: added FetchShareIntake and ReleaseShareIntake (web -> app) — what another app shared to Dou
//        through the OS share sheet, opened on `/share?id=`.
// 2.10.0: added OpenSubWebView and CloseSubWebView (web -> app) and the OnSubWebViewClosed push — a
//         page on another origin shown in a second WebView with no bridge of its own.
// 2.11.0: added FinishSubWebView and SetSubWebViewTitle (sub WebView page -> app), the
//         OnSubWebViewContextChanged push, OpenSubWebView `params` and OnSubWebViewClosed `result`.
// 2.12.0: a sub WebView page may send OpenShareSheet; its host's handshake lists it.
// 2.13.0: added StartAudioRecording and StopAudioRecording (web -> app) with OnAudioRecordingStarted
//         and OnAudioRecordingEnded — a voice message the shell records; the second is also pushed when
//         the shell ends a recording itself.
// 2.14.0: a sub WebView page may send GetSubWebViewUserKey, for a key of its own per origin.
// 2.15.0: a sub WebView page may send SetCanGoBack (and receives OnBackPressed) and the new
//         SetSubWebViewCloseGuard (and receives OnSubWebViewCloseRequested); its handshake reply
//         carries the page's context as `subWebView`, and its host answers a message over 65,536
//         characters with TOO_LARGE.
// 2.16.0: a sub WebView page's manifest decides which of OpenURL, OpenShareSheet, CopyToClipboard and
//         GetSubWebViewUserKey its host answers; a page may send ReportSubWebViewError; TriggerHaptic
//         takes `success`, `warning` and `error`.
// 2.17.0: a sub WebView page's context carries `appLink`; an app link to a page reaches the web as
//         the OnNavigate path `/sub-webview?url=…`, which the web opens in a sub WebView.
// 2.18.0: a sub WebView page may keep its own storage — GetSubWebViewStorage, SetSubWebViewStorage,
//         RemoveSubWebViewStorage, ClearSubWebViewStorage, GetSubWebViewStorageInfo — per origin, with
//         QUOTA_EXCEEDED past 1,048,576 characters.
// 2.19.0: OpenSubWebView takes `appId`, which a page's `appLink` is built from; an app link to a page,
//         `/apps/<appId>?<query>`, reaches the web as its own path, which the web resolves to a page.
// 2.20.0: a sub WebView page may send GetSubWebViewPermission and RequestSubWebViewPermission, to ask
//         the OS for the camera or the microphone before it captures, and OpenSettings; SETTINGS_ERROR
//         joins the page error codes.
// 2.21.0: added StorageGet, StorageSave and StorageClear (web -> app) — a storage medium the shell keeps
//         for the web, the device vault (`nativeSecure`) first; a shell that keeps one lists it in
//         `window.CHATIC_APP_STORAGE_MEDIA`.
// 2.22.0: the WebAppReady reply may carry `subWebViewOpenScope` — how far the shell's OpenSubWebView
//         opens (`anyHttps` on the desktop, which opens any plain https site in the `external` tier);
//         a sub WebView page's context may say `platform: 'desktop'`; `MiniAppLaunchParams` names the
//         `params` DoU's own web opens a mini app with.
export const BRIDGE_VERSION = '2.22.0' as const;

export const BRIDGE_VERSION_INFO = {
    bridgeVersion: BRIDGE_VERSION,
    protocolVersion: BRIDGE_VERSION,
} as const;
