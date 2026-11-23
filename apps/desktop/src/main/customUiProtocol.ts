import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { net, protocol } from 'electron';

import { isDocumentRequest, resolveEntryPath } from './customUi';
import { CUSTOM_UI_SCHEME, isCustomUiUrl } from './webUrl';

export const CUSTOM_UI_SCHEME_PRIVILEGES = {
    scheme: CUSTOM_UI_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
} as const;

let handled = false;

const notFound = (): Response => new Response('Not found', { status: 404 });

const fileResponse = async (path: string): Promise<Response | null> => {
    try {
        const response = await net.fetch(pathToFileURL(path).toString());
        return response.ok ? response : null;
    } catch {
        return null;
    }
};

export const registerCustomUiProtocol = (root: string): void => {
    if (handled) protocol.unhandle(CUSTOM_UI_SCHEME);
    handled = false;
    protocol.handle(CUSTOM_UI_SCHEME, async request => {
        if (!isCustomUiUrl(request.url)) return notFound();
        const entry = resolveEntryPath(root, request.url);
        if (!entry) return notFound();
        const direct = await fileResponse(entry);
        if (direct) return direct;
        if (!isDocumentRequest(request.headers.get('accept'))) return notFound();
        return (await fileResponse(join(root, 'index.html'))) ?? notFound();
    });
    handled = true;
};

export const unregisterCustomUiProtocol = (): void => {
    if (!handled) return;
    protocol.unhandle(CUSTOM_UI_SCHEME);
    handled = false;
};
