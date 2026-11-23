import { readCacheRecords, type CacheRecord } from './readCacheRecords';

export interface PushChannelData {
    id?: string;
    sid?: string;
    name?: string;
    stereo?: string;
    $join?: { userId?: string; notify?: string };
}

export interface PushChannelHint {
    channelId?: string;
    sid?: string;
    channelName?: string;
    uid?: string;
}

export const resolvePushCloudIdFrom = (
    records: readonly CacheRecord<PushChannelData>[],
    hint: PushChannelHint
): string | null => {
    if (!hint.channelId && !hint.uid) return null;
    const channels = records.filter(r => r.type === 'channel');

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
