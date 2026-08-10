import { isNative } from '@chatic/bridges';

import { appBridge } from '../../../bridge';

/**
 * Opens a URL outside the app: the OS browser in the native shell, a new tab otherwise.
 *
 * Loading an arbitrary link inside the webview would strand the user in a page with no back
 * affordance and our session cookies attached, so the shell always hands it to the OS.
 */
export const openExternalUrl = (url: string) => {
    if (isNative()) {
        appBridge.openURL(url);
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
};
