/**
 * Orders channel member ids for the group header avatar stack: the owner is
 * pinned to the front (leftmost), the remaining members keep their incoming
 * order, duplicates are removed, and the list is capped at `max`.
 *
 * The owner is placed first even when it is not present in `memberIds` (e.g. the
 * roster hasn't fully synced yet), so the owner avatar is never dropped. Falsy
 * ids are ignored.
 */
export const orderMemberIdsOwnerFirst = (ownerId: string | undefined, memberIds: string[], max: number): string[] => {
    const ordered: string[] = [];
    const seen = new Set<string>();

    const push = (id: string | undefined) => {
        if (!id || seen.has(id)) return;
        seen.add(id);
        ordered.push(id);
    };

    push(ownerId);
    for (const id of memberIds) push(id);

    return max >= 0 ? ordered.slice(0, max) : ordered;
};
