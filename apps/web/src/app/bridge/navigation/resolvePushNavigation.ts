import { ROUTES } from '../../routes/paths';

export interface ResolvedPushNavigation {
    target: string;
    cid: string | null;
    sid: string | null;
    chatId: string | null;
}

const PARSE_BASE = 'http://chatic.local';

export const resolvePushNavigation = (rawPath: string): ResolvedPushNavigation => {
    if (!rawPath || !rawPath.trim()) {
        return { target: ROUTES.root, cid: null, sid: null, chatId: null };
    }

    let url: URL;
    try {
        url = new URL(rawPath.trim(), PARSE_BASE);
    } catch {
        return { target: rawPath, cid: null, sid: null, chatId: null };
    }

    const params = url.searchParams;
    const cid = params.get('cid');
    const sid = params.get('sid');
    const chatId = params.get('chatId');
    params.delete('cid');
    params.delete('sid');
    params.delete('chatId');

    const normalizedPathname = url.pathname.replace(/\/+$/, '') || '/';
    if (normalizedPathname === '/channel') {
        const channelId = params.get('channelId');
        if (channelId) {
            return { target: ROUTES.channels.room(channelId), cid, sid, chatId };
        }
    }

    const query = params.toString();
    const target = `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
    return { target, cid, sid, chatId };
};
