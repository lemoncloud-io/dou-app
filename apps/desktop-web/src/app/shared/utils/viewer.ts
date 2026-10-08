import type { PlaceProfileEntry } from '../stores/useSiteProfilesStore';

/** Identity of the signed-in user, used to name their own (and optimistic) messages. */
export interface MessageViewer {
    uid: string | null;
    name: string;
    /**
     * My per-channel cloud user id (`channel.$join.userId`). Optimistic messages
     * carry my account id as `ownerId`, but the server rewrites it to this cloud
     * id once the message persists — so both ids identify my own messages.
     */
    cloudUid?: string | null;
    /**
     * My account photo. A message read back from the cache carries no embedded
     * `owner$.thumbnail`, so after a reload my own rows showed an initial while
     * the rail showed my photo.
     */
    photo?: string;
}

// An id is "mine" when it matches either my account id (optimistic messages carry it)
// or my per-channel cloud user id (the server rewrites the owner to this once the
// message persists) — so my own rows stay identified across the optimistic→persisted
// swap. This answers "is this id mine". "Is this message mine" goes through `isOwnChat` below,
// which adds the webhook rule — message rows, the mentions inbox, the OS and cross-cloud banners and
// the unread badge all ask it, since a second copy of the rule would drift. Only `useChatOutbox`
// compares `ownerId` with the account id directly, on purpose: the failed rows it resends are always
// optimistic rows I wrote, which carry that id.
export const isViewerId = (userId: string | undefined, viewer: MessageViewer): boolean =>
    (!!viewer.uid && userId === viewer.uid) || (!!viewer.cloudUid && userId === viewer.cloudUid);

/**
 * My place profile out of the current place's override map. It can sit under my per-channel cloud
 * id (a synced row) or my account id (the row my own save writes), so both are tried — the cloud id
 * first, as every other surface that names me does.
 */
export const viewerPlaceProfile = (
    viewer: MessageViewer,
    placeProfiles: Record<string, PlaceProfileEntry>
): PlaceProfileEntry | undefined =>
    (viewer.cloudUid ? placeProfiles[viewer.cloudUid] : undefined) ??
    (viewer.uid ? placeProfiles[viewer.uid] : undefined);

/** A message an integration sent (`stereo: 'webhook'`), as opposed to one a person wrote. */
export const isWebhookChat = (chat: { stereo?: string }): boolean => chat.stereo === 'webhook';

/**
 * Whether a message is mine. A webhook never is, whatever owner id the server stamped on it: an id
 * equal to mine would otherwise offer Delete, borrow my avatar, drop the card from the unread
 * divider and count, silence its banner and clear the sidebar badge. Every surface asks this one
 * question, so none of them can disagree about the same message.
 */
export const isOwnChat = (chat: { ownerId?: string; stereo?: string }, viewer: MessageViewer): boolean =>
    !isWebhookChat(chat) && isViewerId(chat.ownerId, viewer);
