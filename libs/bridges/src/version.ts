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
export const BRIDGE_VERSION = '2.9.0' as const;

export const BRIDGE_VERSION_INFO = {
    bridgeVersion: BRIDGE_VERSION,
    protocolVersion: BRIDGE_VERSION,
} as const;
