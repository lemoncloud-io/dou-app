import type { MessageJumpOrigin, ReadingPosition } from '../../../shared';

export interface ReaderLocation {
    cloudId: string;
    placeId: string | null;
    channelId: string | null;
}

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
        anchorChatNo: details.position?.channelId === here.channelId ? details.position.chatNo : null,
        threadRootId: details.threadRootId,
        sameChannel: targetChannelId === here.channelId,
    };
};

export const shouldOfferReturn = (
    origin: MessageJumpOrigin | null,
    here: ReaderLocation,
    listedChannelIds: ReadonlySet<string>
): origin is MessageJumpOrigin => {
    if (!origin) return false;
    const samePlace = origin.cloudId === here.cloudId && origin.placeId === here.placeId;
    if (!samePlace) return true;
    if (!listedChannelIds.has(origin.channelId)) return false;
    return origin.channelId !== here.channelId || origin.sameChannel;
};

export type ReturnRoute = 'switch-cloud' | 'switch-place' | 'select';

export const returnRoute = (origin: MessageJumpOrigin, here: ReaderLocation): ReturnRoute =>
    origin.cloudId !== here.cloudId
        ? 'switch-cloud'
        : origin.placeId && origin.placeId !== here.placeId
          ? 'switch-place'
          : 'select';
