import { isWebhookChat, type DomainChat } from '@chatic/data';

import { usePlaceProfilesStore } from '../stores/usePlaceProfilesStore';
import type { PlaceProfileEntry } from '../stores/useSiteProfilesStore';
import { isPlaceholderName } from './displayName';
import { resolveDisplay } from './displayProfile';
import { isOwnChat, viewerPlaceProfile, type MessageViewer } from './viewer';

type SenderLike = Pick<DomainChat, 'ownerId' | 'owner$' | 'stereo'>;
type PlaceProfiles = Record<string, PlaceProfileEntry> | undefined;

/**
 * Who wrote a message, named the way the feed names them, for surfaces that are not the feed: an OS
 * banner, the inbox, my threads, a list preview. The member's Place Profile nick wins over the
 * message's `owner$.name`, a snapshot the server took when the row was written, which can differ
 * from the name the feed shows.
 *
 * My own profile row can sit under my account id or my per-channel cloud id, and an optimistic
 * message carries the account id while a persisted one carries the cloud id, so a message of mine is
 * looked up under both — the feed does the same. A webhook is not a member, so no profile names it
 * (its owner id could collide with a person's). Empty when nothing names the sender; the caller
 * decides what an unnamed sender reads as.
 */
export const senderNameIn = (chat: SenderLike, profiles: PlaceProfiles, viewer?: MessageViewer): string => {
    const snapshot = isPlaceholderName(chat.owner$?.name) ? '' : (chat.owner$?.name?.trim() ?? '');
    if (isWebhookChat(chat) || !profiles) return snapshot;
    const mine = viewer && isOwnChat(chat, viewer) ? viewerPlaceProfile(viewer, profiles) : undefined;
    const place = mine ?? (chat.ownerId ? profiles[chat.ownerId] : undefined);
    return resolveDisplay(place, snapshot, undefined).name;
};

/**
 * `senderNameIn` with the place's mirrored profiles, read when called — for code that runs outside a
 * render (a feed callback, a capture). A component subscribes to the place's profiles instead
 * (`usePlaceProfilesStore`) and calls `senderNameIn`, so a nick that arrives later redraws it.
 */
export const chatSenderName = (chat: SenderLike, placeId: string | undefined, viewer?: MessageViewer): string =>
    senderNameIn(chat, placeId ? usePlaceProfilesStore.getState().bySid[placeId] : undefined, viewer);
