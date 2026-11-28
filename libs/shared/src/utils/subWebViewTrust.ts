// eslint-disable-next-line @nx/enforce-module-boundaries -- the desktop shell's main bundle aliases this one file and resolves no package names, so it reaches the protocol file by path
export {
    fitsSubWebViewData,
    isOpenableSubWebViewUrl,
    isSubWebViewAppId,
    isSubWebViewParams,
    SUB_WEBVIEW_DATA_LIMIT,
    SUB_WEBVIEW_MESSAGE_LIMIT,
    SUB_WEBVIEW_TITLE_LIMIT,
    subWebViewDisplayOf,
    subWebViewOriginOf,
    type SubWebViewTrust,
    subWebViewTrustOf,
} from '../../../mini-app/protocol/src/subWebViewTrust';
