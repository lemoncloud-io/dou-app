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
// swap. A surface that asks "is this message mine" should go through here; the rule is subtle
// enough that a second copy would drift. Message rows, the mentions inbox and the OS
// notifications do; some older checks still compare the account id alone.
export const isViewerId = (userId: string | undefined, viewer: MessageViewer): boolean =>
    (!!viewer.uid && userId === viewer.uid) || (!!viewer.cloudUid && userId === viewer.cloudUid);
