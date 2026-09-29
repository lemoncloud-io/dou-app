import type { MessageJumpOrigin, ReadingPosition } from '../../../shared';

/** Where the reader stands now: enough to record a return point and to judge one. */
export interface ReaderLocation {
    cloudId: string;
    placeId: string | null;
    channelId: string | null;
}

/**
 * The return point for a jump about to leave `here` for `targetChannelId`.
 * Null when there is no open channel to come back to.
 */
export const originFor = (
    here: ReaderLocation,
    targetChannelId: string,
    details: { label: string; position: ReadingPosition | null; threadRootId: string | null }
): MessageJumpOrigin | null => {
    if (!here.channelId) return null;
    return {
        cloudId: here.cloudId,
        placeId: here.placeId,
        channelId: here.channelId,
        label: details.label,
        // A position the feed reported for another channel says nothing about this one:
        // with none, the reader was at the latest, where a channel opens.
        anchorChatNo: details.position?.channelId === here.channelId ? details.position.chatNo : null,
        threadRootId: details.threadRootId,
        sameChannel: targetChannelId === here.channelId,
    };
};

/**
 * Whether the return bar should be offered. The reader has to be somewhere
 * else, and a channel in the open place has to still be in its list: one they
 * were removed from is not somewhere to send them.
 */
export const shouldOfferReturn = (
    origin: MessageJumpOrigin | null,
    here: ReaderLocation,
    listedChannelIds: ReadonlySet<string>
): origin is MessageJumpOrigin => {
    if (!origin) return false;
    const samePlace = origin.cloudId === here.cloudId && origin.placeId === here.placeId;
    if (!samePlace) return true;
    if (!listedChannelIds.has(origin.channelId)) return false;
    // Back in the origin channel by any route means back, unless the jump never left it.
    return origin.channelId !== here.channelId || origin.sameChannel;
};

export type ReturnRoute = 'switch-cloud' | 'switch-place' | 'select';

/** A place-less origin (none was settled when it was recorded) is taken as this place. */
export const returnRoute = (origin: MessageJumpOrigin, here: ReaderLocation): ReturnRoute =>
    origin.cloudId !== here.cloudId
        ? 'switch-cloud'
        : origin.placeId && origin.placeId !== here.placeId
          ? 'switch-place'
          : 'select';
