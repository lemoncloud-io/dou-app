import { isNative } from '@chatic/bridges';

import { appBridge } from '../../../bridge';
import { shellCapabilities } from '../../../bridge/shellCapabilities';
import { openSubWebViewTarget, subWebViewTargetOfUrl } from '../../../bridge/subWebViewLink';

/**
 * Opens a URL outside the app: the OS browser in the native shell, a new tab otherwise.
 *
 * Loading an arbitrary link inside the webview would strand the user in a page with no back
 * affordance and our session cookies attached, so the shell always hands it to the OS.
 *
 * A mini app link is the exception: the page is meant to run inside the app, with its bridge. Handed
 * to the OS, its own address opens a browser, and whether the OS hands an app link back to the app
 * that sent it is the OS's call, not ours. So in a shell with the sub WebView, either opens there
 * directly. An app without it hands the link to the OS as before, where the app link still reaches
 * the landing page that offers the app. So does an app link naming an app this build does not know:
 * a tap the user asked for should open something, not nothing.
 */
export const openExternalUrl = (url: string) => {
    if (isNative()) {
        const subWebViewTarget = shellCapabilities.supports('OpenSubWebView') ? subWebViewTargetOfUrl(url) : null;
        if (subWebViewTarget) {
            void openSubWebViewTarget(subWebViewTarget).then(opening => {
                if (opening === 'unknownApp') appBridge.openURL(url);
            });
            return;
        }
        appBridge.openURL(url);
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
};
