import { isWebhookChat, type DomainChat } from '@chatic/runtime';

import { usePlaceProfilesStore } from '../stores/usePlaceProfilesStore';
import type { PlaceProfileEntry } from '../stores/useSiteProfilesStore';
import { isPlaceholderName } from './displayName';
import { resolveDisplay } from './displayProfile';
import { isOwnChat, viewerPlaceProfile, type MessageViewer } from './viewer';

type SenderLike = Pick<DomainChat, 'ownerId' | 'owner$' | 'stereo'>;
type PlaceProfiles = Record<string, PlaceProfileEntry> | undefined;

export const senderNameIn = (chat: SenderLike, profiles: PlaceProfiles, viewer?: MessageViewer): string => {
    const snapshot = isPlaceholderName(chat.owner$?.name) ? '' : (chat.owner$?.name?.trim() ?? '');
    if (isWebhookChat(chat) || !profiles) return snapshot;
    const mine = viewer && isOwnChat(chat, viewer) ? viewerPlaceProfile(viewer, profiles) : undefined;
    const place = mine ?? (chat.ownerId ? profiles[chat.ownerId] : undefined);
    return resolveDisplay(place, snapshot, undefined).name;
};

export const chatSenderName = (chat: SenderLike, placeId: string | undefined, viewer?: MessageViewer): string =>
    senderNameIn(chat, placeId ? usePlaceProfilesStore.getState().bySid[placeId] : undefined, viewer);
