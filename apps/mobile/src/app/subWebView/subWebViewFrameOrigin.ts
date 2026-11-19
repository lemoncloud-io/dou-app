import { NativeModules, Platform } from 'react-native';

/**
 * Whether this WebView reports a page's message under the origin of the frame that posted it — the
 * only thing that lets the sub WebView's origin check tell the page from a frame of another site
 * inside it.
 *
 * - iOS: yes. react-native-webview reports the URL of the frame that posted (`WKScriptMessage.frameInfo`),
 *   so a frame of another site fails the origin check there already.
 * - Android: what `SubWebViewFrames` answers. A WebView without web message listeners hands every
 *   frame the same channel and reports the top-level page's URL for all of them.
 * - An app without the module, or any other platform: no. Unknown counts as closed.
 */
export const subWebViewReportsFrameOrigin = (): boolean => {
    if (Platform.OS === 'ios') return true;
    if (Platform.OS !== 'android') return false;
    return NativeModules.SubWebViewFrames?.reportsFrameOrigin === true;
};
