import { runtime } from '@chatic/runtime';

import { shellCapabilities } from '../../../bridge/shellCapabilities';
import { openSubWebViewTarget, subWebViewTargetOfUrl } from '../../../bridge/subWebViewLink';

export const openExternalUrl = (url: string) => {
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
