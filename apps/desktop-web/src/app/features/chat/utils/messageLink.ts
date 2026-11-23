import { runtime } from '@chatic/runtime';

import type { PushDeeplinkTarget } from '../../../shared/utils/parsePushDeeplink';

export type MessageLinkTarget = PushDeeplinkTarget & { chatNo: number };

const linkScheme = (): string => runtime.settings.get<string>('net.deeplink.desktopProtocol') ?? 'chatic';

export const buildMessageLink = (
    { cloudId, placeId, channelId, chatNo, rootId }: MessageLinkTarget,
    scheme: string = linkScheme()
): string => {
    const enc = encodeURIComponent;
    const path = [cloudId ?? '', placeId, channelId].map(enc).join('/');
    return `${scheme}://message/${path}/${chatNo}${rootId ? `?root=${enc(rootId)}` : ''}`;
};
