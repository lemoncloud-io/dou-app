/**
 * Bridge runtime version exposed through WebAppReady, request metadata, and bridge errors.
 *
 * Keep this value easy to find and bump it whenever the WebView wire contract or bridge
 * capability surface changes. App release version and npm package version can differ from
 * this runtime protocol version.
 */
// 2.2.0: added ShowNotification (web -> app) for desktop OS notifications. See docs/adr/0001.
// 2.3.0: StartFileTransfer accepts `download`; added SaveToPhotoLibrary and ShareFile (web -> app).
//        TriggerHaptic landed while 2.2.0 was current, so this is the first version that has it.
// 2.4.0: added PickAttachments, PrepareVideo, OpenFile and SaveFile (web -> app); SaveToPhotoLibrary
//        takes MP4 and ShareFile the server's document formats.
export const BRIDGE_VERSION = '2.4.0' as const;

/**
 * Protocol version currently spoken by this bridge runtime.
 * This is separated from the symbol above so future compatibility layers can support
 * a bridge runtime version that speaks an older/newer protocol version.
 */
export const BRIDGE_PROTOCOL_VERSION = BRIDGE_VERSION;

export const BRIDGE_VERSION_INFO = {
    bridgeVersion: BRIDGE_VERSION,
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
} as const;
