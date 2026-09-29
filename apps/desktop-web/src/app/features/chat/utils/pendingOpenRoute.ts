/**
 * What the home screen does with a pending "open this channel" target (a notification click, or a
 * 1:1 that was just started).
 *
 * - `switch-cloud` / `switch-place`: the channel lives elsewhere; switch first and land on it once
 *   that scope's channels load.
 * - `wait`: it is in this place but not in the list yet — a room the server just created is
 *   written to the cache before the call returns, and the list hears about it only on the next
 *   emit. Selecting an id the list lacks makes the home screen fall back to the remembered
 *   channel, so the target is held until the room is listed.
 * - `select`: it is listed here; open it now.
 */
export type PendingOpenRoute = 'switch-cloud' | 'switch-place' | 'wait' | 'select';

export const pendingOpenRoute = (
    target: { cloudId?: string; placeId: string; channelId: string },
    here: { cloudId: string; placeId: string | null | undefined; listedIds: ReadonlySet<string> }
): PendingOpenRoute => {
    if (target.cloudId && target.cloudId !== here.cloudId) return 'switch-cloud';
    if (target.placeId && target.placeId !== here.placeId) return 'switch-place';
    return here.listedIds.has(target.channelId) ? 'select' : 'wait';
};
