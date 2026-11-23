import { ROUTES } from '../routes/paths';

export type InAppPushData = Record<string, unknown>;

const PARSE_BASE = 'http://chatic.local';

const asString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const mergePushPayload = (data: InAppPushData): Record<string, unknown> => {
    const { payload } = data;
    if (typeof payload === 'string') {
        try {
            return { ...data, ...(JSON.parse(payload) as Record<string, unknown>) };
        } catch {
            return data;
        }
    }
    if (payload && typeof payload === 'object') {
        return { ...data, ...(payload as Record<string, unknown>) };
    }
    return data;
};

export const extractPushContext = (data: InAppPushData): { cid?: string; sid?: string; chatId?: string } => {
    const source = mergePushPayload(data);
    return { cid: asString(source.cid), sid: asString(source.sid), chatId: asString(source.chatId) };
};

const asId = (value: unknown): string | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return asString(value);
};

export interface PushBannerFields {
    ownerId?: string;
    channelId?: string;
    channelName?: string;
    thumbnail?: string;
}

export const extractPushBannerFields = (data: InAppPushData): PushBannerFields => {
    const source = mergePushPayload(data);
    return {
        ownerId: asId(source.ownerId),
        channelId: asId(source.channelId),
        channelName: asString(source.channelName),
        thumbnail: asString(source.thumbnail) ?? asString(source.imageUrl),
    };
};

export const extractPushMessageId = (data: InAppPushData): string | undefined => {
    const source = mergePushPayload(data);
    return asString(source.messageId) ?? asString(source.id);
};

export interface PushCloudHint {
    cid?: string;
    uid?: string;
    channelId?: string;
    sid?: string;
    channelName?: string;
}

export const extractPushCloudHint = (data: InAppPushData): PushCloudHint => {
    const source = mergePushPayload(data);
    return {
        cid: asString(source.cid),
        uid: asString(source.uid),
        channelId: asString(source.channelId),
        sid: asString(source.sid),
        channelName: asString(source.channelName),
    };
};

const stripPushScheme = (link: string): string => {
    const match = link.match(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\/(.*)$/);
    return match ? match[1] : link;
};

export const resolveInAppPushRoute = (data: InAppPushData | undefined | null): string | null => {
    if (!data) {
        return null;
    }

    const { cid, sid, chatId } = extractPushContext(data);
    const link = asString(data.link) ?? asString(data.clickAction);

    if (!link) {
        const channelId = asString(data.channelId);
        if (!channelId) {
            return null;
        }
        const query = [
            cid ? `cid=${encodeURIComponent(cid)}` : null,
            sid ? `sid=${encodeURIComponent(sid)}` : null,
            chatId ? `chatId=${encodeURIComponent(chatId)}` : null,
        ]
            .filter(Boolean)
            .join('&');
        return `${ROUTES.channels.room(channelId)}${query ? `?${query}` : ''}`;
    }

    let url: URL;
    try {
        url = new URL(stripPushScheme(link), PARSE_BASE);
    } catch {
        return null;
    }

    if (cid && !url.searchParams.has('cid')) {
        url.searchParams.set('cid', cid);
    }
    if (sid && !url.searchParams.has('sid')) {
        url.searchParams.set('sid', sid);
    }
    if (chatId && !url.searchParams.has('chatId')) {
        url.searchParams.set('chatId', chatId);
    }

    return `${url.pathname}${url.search}${url.hash}`;
};
