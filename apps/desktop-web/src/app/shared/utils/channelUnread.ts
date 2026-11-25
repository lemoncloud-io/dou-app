import type { DomainChannel } from '@chatic/runtime-react';

import { isNotifiableChat } from './notifiableChat';
import { isOwnChat } from './viewer';

export interface ReadCursor {
    chatNo: number;
    metaNo?: number;
}

const joinCursorOf = (channel: DomainChannel): ReadCursor | undefined => {
    const join = channel.$join as { chatNo?: number; joinedNo?: number; metaNo?: number } | undefined;
    if (!join) return undefined;
    return { chatNo: Math.max(join.chatNo ?? 0, join.joinedNo ?? 0), metaNo: join.metaNo };
};

const furthest = (a: ReadCursor | undefined, b: ReadCursor | undefined): ReadCursor | undefined => {
    if (!a) return b;
    if (!b) return a;
    if (a.chatNo !== b.chatNo) return a.chatNo > b.chatNo ? a : b;
    return a.metaNo !== undefined ? a : b;
};

export const channelReadNo = (channel: DomainChannel, localReadNo: number): number =>
    Math.max(localReadNo, channel.$join?.chatNo ?? 0);

export const computeChannelUnread = (
    channel: DomainChannel,
    myUid: string | null,
    localReadNo?: number,
    cursor?: ReadCursor
): number => {
    const last = channel.lastChat$;
    const viewer = { uid: myUid, name: '', cloudUid: channel.$join?.userId ?? null };
    if (!!last && isNotifiableChat(last) && isOwnChat(last, viewer)) return 0;

    const head = channel.chatNo ?? 0;
    const headMeta = channel.metaNo ?? 0;

    const boundary = furthest(cursor, joinCursorOf(channel));
    const derived = boundary
        ? head - headMeta - Math.max(0, boundary.chatNo - (boundary.metaNo ?? headMeta))
        : (channel.unreadCount ?? 0);

    if (localReadNo === undefined || head <= 0) return Math.max(0, derived);
    return Math.max(0, Math.min(derived, head - localReadNo));
};
