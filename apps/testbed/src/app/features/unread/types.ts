// Unread aggregates derived in a single pass over the active cloud's full channel list.
// One source feeds three views: per-channel badges (byChannel), per-site dots (byPlace),
// and the cloud-wide total.
export interface UnreadAggregates {
    /** unread count per channel id (clamped to >= 0). */
    byChannel: Record<string, number>;
    /** unread count summed per owning site id (sid). */
    byPlace: Record<string, number>;
    /** sum of all per-channel unread counts across the active cloud. */
    total: number;
}
