/**
 * Resolve which cloud an FCM push belongs to WITHOUT `data.cid` (the deployed
 * backends can't stamp it — confirmed live: the field arrives as `""`). The
 * engine's IndexedDB cache partitions every record by cloud (`cid`), and any
 * cloud the user is a member of has been visited at least once (joining
 * requires it) — so its channels are cached. Reverse-lookup the push's channel
 * across partitions.
 *
 * Channel ids are per-cloud sequential numbers, so a bare channelId can
 * collide across clouds: narrow by `sid` (place) and `channelName`, and return
 * a cloud only on a UNIQUE match — no badge beats a wrong badge.
 *
 * Reads the engine cache directly (read-only): the repository layer is scoped
 * to the ACTIVE cloud's partition and exposes no cross-partition query, and
 * this stays a desktop-web-local concern until the backend can ship `cid`
 * (when it does, the badge hook prefers `cid` and this never runs).
 */
import { readCacheRecords, type CacheRecord } from './readCacheRecords';

export interface PushChannelData {
    id?: string;
    sid?: string;
    name?: string;
    $join?: { userId?: string; notify?: string };
}

export interface PushChannelHint {
    channelId?: string;
    sid?: string;
    channelName?: string;
    /**
     * The receiving user's id in the SOURCE cloud (the push's `data.uid`). The signed-in user
     * has a distinct id per cloud, so this attributes the push to its cloud even when the
     * channelId reverse-lookup is ambiguous — channel ids are per-cloud sequential and collide
     * across clouds, and the push carries neither `sid` nor `channelName` to disambiguate.
     */
    uid?: string;
}

/**
 * Pure core of {@link resolvePushCloudId} over records the caller already read, so one push
 * costs one cache scan even when it also needs {@link findPushChannel}.
 */
export const resolvePushCloudIdFrom = (
    records: readonly CacheRecord<PushChannelData>[],
    hint: PushChannelHint
): string | null => {
    if (!hint.channelId && !hint.uid) return null;
    const channels = records.filter(r => r.type === 'channel');

    // Primary: the source-cloud uid. Every cached channel of the source cloud carries
    // `$join.userId === uid` (the user's id in that cloud), so this resolves the cloud
    // uniquely even when channel ids collide across clouds.
    if (hint.uid) {
        const byUid = [
            ...new Set(
                channels
                    .filter(r => r.data?.$join?.userId === hint.uid)
                    .map(r => r.cid)
                    .filter(Boolean)
            ),
        ] as string[];
        if (byUid.length === 1) return byUid[0];
    }

    // Fallback: reverse-look the channel id up, narrowed by sid/name when present. Each
    // narrowing filter only applies when it leaves a candidate — a stale cached name must
    // not erase a true match.
    if (!hint.channelId) return null;
    let candidates = channels.filter(r => r.data?.id === hint.channelId);
    if (hint.sid) {
        const bySid = candidates.filter(r => r.data?.sid === hint.sid);
        if (bySid.length > 0) candidates = bySid;
    }
    if (hint.channelName) {
        const byName = candidates.filter(r => r.data?.name === hint.channelName);
        if (byName.length > 0) candidates = byName;
    }

    const cloudIds = [...new Set(candidates.map(r => r.cid).filter(Boolean))] as string[];
    return cloudIds.length === 1 ? cloudIds[0] : null;
};

export const resolvePushCloudId = async (hint: PushChannelHint): Promise<string | null> => {
    if (!hint.channelId && !hint.uid) return null;
    return resolvePushCloudIdFrom(await readCacheRecords<PushChannelData>(), hint);
};

/**
 * The cached channel record a push refers to, confined to its source cloud. Channel ids collide
 * across clouds, so a bare id match could return another cloud's channel (and its notify mode).
 * Scope by `cloudId` when known, else by the push's `uid` (the user's id in the source cloud);
 * with neither, answer only on a unique match — no record beats the wrong one.
 */
export const findPushChannel = (
    records: readonly CacheRecord<PushChannelData>[],
    { channelId, cloudId, uid }: { channelId: string; cloudId?: string | null; uid?: string }
): PushChannelData | undefined => {
    const byId = records.filter(r => r.type === 'channel' && String(r.data?.id ?? '') === channelId);
    const scoped = cloudId
        ? byId.filter(r => r.cid === cloudId)
        : uid
          ? byId.filter(r => r.data?.$join?.userId === uid)
          : byId;
    return scoped.length === 1 ? scoped[0].data : undefined;
};
