export interface PushDeeplinkTarget {
    cloudId?: string;
    placeId: string;
    channelId: string;
    rootId?: string;
    chatNo?: number;
}

const MESSAGE_LINK = /^chatic(?:-dev)?:\/\/message\/([^/?#]*)\/([^/?#]*)\/([^/?#]+)\/(\d+)\/?(?:\?root=([^&#]+))?$/;

export const parsePushDeeplink = (deeplink: string | undefined | null): PushDeeplinkTarget | null => {
    if (!deeplink) return null;
    const dec = (value: string | undefined): string => (value ? decodeURIComponent(value) : '');
    const link = MESSAGE_LINK.exec(deeplink);
    if (link) {
        try {
            const [cloudId, placeId, channelId, chatNo, rootId] = link.slice(1).map(dec);
            if (!Number.isSafeInteger(Number(chatNo))) return null;
            return {
                ...(cloudId ? { cloudId } : {}),
                placeId,
                channelId,
                chatNo: Number(chatNo),
                ...(rootId ? { rootId } : {}),
            };
        } catch {
            return null;
        }
    }
    if (/^chatic(?:-dev)?:\/\//.test(deeplink)) return null;
    if (deeplink.startsWith('chatic-open:')) {
        const parts = deeplink.slice('chatic-open:'.length).split('|');
        if (parts.length >= 3) {
            const channelId = dec(parts[2]);
            if (!channelId) return null;
            return {
                cloudId: dec(parts[0]) || undefined,
                placeId: dec(parts[1]),
                channelId,
                rootId: dec(parts[3]) || undefined,
            };
        }
        const channelId = dec(parts[1]);
        if (!channelId) return null;
        return { placeId: dec(parts[0]), channelId };
    }
    const pathMatch = /\/channels\/([^/?#]+)/.exec(deeplink);
    if (pathMatch) {
        const channelId = dec(pathMatch[1]);
        return channelId ? { placeId: '', channelId } : null;
    }
    const queryStart = deeplink.indexOf('?');
    const query = queryStart >= 0 ? deeplink.slice(queryStart + 1) : deeplink;
    const channelId = new URLSearchParams(query).get('channelId') ?? '';
    return channelId ? { placeId: '', channelId } : null;
};

export const buildOpenDeeplink = ({ cloudId, placeId, channelId, rootId }: PushDeeplinkTarget): string => {
    const enc = encodeURIComponent;
    if (rootId) return `chatic-open:${enc(cloudId ?? '')}|${enc(placeId)}|${enc(channelId)}|${enc(rootId)}`;
    if (cloudId) return `chatic-open:${enc(cloudId)}|${enc(placeId)}|${enc(channelId)}`;
    return `chatic-open:${enc(placeId)}|${enc(channelId)}`;
};
