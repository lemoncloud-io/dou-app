import { config } from '@chatic/config';

import type { PushDeeplinkTarget } from '../../../shared/utils/parsePushDeeplink';

/** A message's address, as a copied link carries it. */
export type MessageLinkTarget = PushDeeplinkTarget & { chatNo: number };

/**
 * The shell's own scheme: `chatic:` for the app, `chatic-dev:` for the dev channel's — the same
 * registry key the sign-in hand-off launches by, so a link copied in one opens that one. Read per call:
 * the registry answers nothing until boot.
 */
const linkScheme = (): string => config.get<string>('net.deeplink.desktopProtocol') ?? 'chatic';

/**
 * A link to one message that opens the app on it: `chatic://message/<cloud>/<place>/<channel>/<chatNo>`,
 * with `?root=` for a thread reply. It only opens for someone who is a member: the app resolves it
 * against the reader's own clouds and channels, and the link carries nothing else.
 */
export const buildMessageLink = (
    { cloudId, placeId, channelId, chatNo, rootId }: MessageLinkTarget,
    scheme: string = linkScheme()
): string => {
    const enc = encodeURIComponent;
    const path = [cloudId ?? '', placeId, channelId].map(enc).join('/');
    return `${scheme}://message/${path}/${chatNo}${rootId ? `?root=${enc(rootId)}` : ''}`;
};
