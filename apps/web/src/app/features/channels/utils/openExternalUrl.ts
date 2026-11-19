import { runtime } from '@chatic/runtime';

import { shellCapabilities } from '../../../bridge/shellCapabilities';
import { openSubWebViewTarget, subWebViewTargetOfUrl } from '../../../bridge/subWebViewLink';

/**
 * Opens a URL outside the app, as the host does (`runtime.links.openUrl`): the OS browser in the app,
 * a new tab in a browser.
 *
 * A mini app link is the exception: the page is meant to run inside the app, with its bridge. Handed
 * to the OS, its own address opens a browser, and whether the OS hands an app link back to the app
 * that sent it is the OS's call, not ours. So in an app with the sub WebView, either opens there
 * directly. An app without it hands the link to the OS as before, where the app link still reaches
 * the landing page that offers the app. So does an app link naming an app this build does not know:
 * a tap the user asked for should open something, not nothing.
 */
export const openExternalUrl = (url: string) => {
    // A browser has no sub WebView, so a link there opens a tab, whatever it names.
    const opensSubWebViews = runtime.links.subWebView !== null && shellCapabilities.supports('OpenSubWebView');
    const subWebViewTarget = opensSubWebViews ? subWebViewTargetOfUrl(url) : null;
    if (subWebViewTarget) {
        void openSubWebViewTarget(subWebViewTarget).then(opening => {
            if (opening === 'unknownApp') runtime.links.openUrl(url);
        });
        return;
    }
    runtime.links.openUrl(url);
};
