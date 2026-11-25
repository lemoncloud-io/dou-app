import type { SubWebViewParams } from '@chatic/bridge-messages';
import { runtime } from '@chatic/runtime-react';

import { shellCapabilities } from './shellCapabilities';

export type SubWebViewOpening = { via: 'subWebView'; viewId: string } | { via: 'external' } | { via: 'browser' };

export const openSubWebView = async ({
    url,
    title,
    params,
    appId,
}: {
    url: string;
    title?: string;
    params?: SubWebViewParams;
    appId?: string;
}): Promise<SubWebViewOpening> => {
    const { subWebView } = runtime.links;
    if (!subWebView) {
        runtime.links.openUrl(url);
        return { via: 'browser' };
    }
    if (!shellCapabilities.supports('OpenSubWebView')) {
        runtime.links.openUrl(url);
        return { via: 'external' };
    }
    const viewId = await subWebView.open(url, { title, params, appId });
    return { via: 'subWebView', viewId };
};
