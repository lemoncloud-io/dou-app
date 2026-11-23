import { isWebhookChat } from '@chatic/runtime';

import type { PlaceProfileEntry } from '../stores/useSiteProfilesStore';

export interface MessageViewer {
    uid: string | null;
    name: string;
    cloudUid?: string | null;
    photo?: string;
}

export const isViewerId = (userId: string | undefined, viewer: MessageViewer): boolean =>
    (!!viewer.uid && userId === viewer.uid) || (!!viewer.cloudUid && userId === viewer.cloudUid);

export const viewerPlaceProfile = (
    viewer: MessageViewer,
    placeProfiles: Record<string, PlaceProfileEntry>
): PlaceProfileEntry | undefined =>
    (viewer.cloudUid ? placeProfiles[viewer.cloudUid] : undefined) ??
    (viewer.uid ? placeProfiles[viewer.uid] : undefined);

export { isWebhookChat };

export const isOwnChat = (chat: { ownerId?: string; stereo?: string }, viewer: MessageViewer): boolean =>
    !isWebhookChat(chat) && isViewerId(chat.ownerId, viewer);
