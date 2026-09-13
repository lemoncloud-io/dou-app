import { describe, expect, it } from 'vitest';

import type { CacheRecord } from './readCacheRecords';
import { findPushChannel, resolvePushCloudIdFrom, type PushChannelData } from './resolvePushCloudId';

// Channel ids are per-cloud sequences: "7" exists in both clouds, muted only in cloud B.
const records: CacheRecord<PushChannelData>[] = [
    { type: 'channel', cid: 'cloud-a', data: { id: '7', sid: 's1', $join: { userId: 'ua', notify: 'all' } } },
    { type: 'channel', cid: 'cloud-b', data: { id: '7', sid: 's9', $join: { userId: 'ub', notify: 'none' } } },
    { type: 'chat', cid: 'cloud-b', data: { id: '7' } },
];

describe('findPushChannel', () => {
    it('confines a colliding channel id to the source cloud', () => {
        expect(findPushChannel(records, { channelId: '7', cloudId: 'cloud-a' })?.$join?.notify).toBe('all');
        expect(findPushChannel(records, { channelId: '7', cloudId: 'cloud-b' })?.$join?.notify).toBe('none');
    });

    it('falls back to the source-cloud uid when the cloud is unknown', () => {
        expect(findPushChannel(records, { channelId: '7', cloudId: null, uid: 'ua' })?.$join?.notify).toBe('all');
    });

    it('answers nothing for an ambiguous id rather than another cloud’s record', () => {
        expect(findPushChannel(records, { channelId: '7' })).toBeUndefined();
    });
});

describe('resolvePushCloudIdFrom', () => {
    it('resolves by uid, then by a unique narrowed channel match', () => {
        expect(resolvePushCloudIdFrom(records, { uid: 'ub' })).toBe('cloud-b');
        expect(resolvePushCloudIdFrom(records, { channelId: '7', sid: 's1' })).toBe('cloud-a');
        expect(resolvePushCloudIdFrom(records, { channelId: '7' })).toBeNull();
    });
});
