export type PendingOpenRoute = 'switch-cloud' | 'switch-place' | 'wait' | 'select';

export const pendingOpenRoute = (
    target: { cloudId?: string; placeId: string; channelId: string },
    here: { cloudId: string; placeId: string | null | undefined; listedIds: ReadonlySet<string> }
): PendingOpenRoute => {
    if (target.cloudId && target.cloudId !== here.cloudId) return 'switch-cloud';
    if (target.placeId && target.placeId !== here.placeId) return 'switch-place';
    return here.listedIds.has(target.channelId) ? 'select' : 'wait';
};
