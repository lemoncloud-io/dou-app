import type { CacheModelOf, CacheQueryOf, CacheType } from '@chatic/app-messages';

import { BaseDbAdapter } from './BaseDbAdapter';

const contextProvider = {
    getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
    setContext: () => undefined,
} as never;

/** A minimal implementation that only records reads/deletes — for observing what the default `clearByChannelId` requests. */
class RecordingAdapter<TType extends CacheType> extends BaseDbAdapter<TType> {
    public readonly loadAllCalls: Array<CacheQueryOf<TType> | undefined> = [];
    public readonly deleted: string[][] = [];

    constructor(
        type: TType,
        private readonly rows: Array<Record<string, unknown>>
    ) {
        super(type, contextProvider);
    }

    async save(): Promise<CacheModelOf<TType>> {
        throw new Error('not used');
    }
    async saveAll(): Promise<CacheModelOf<TType>[]> {
        throw new Error('not used');
    }
    async load(): Promise<CacheModelOf<TType> | null> {
        return null;
    }
    async loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]> {
        this.loadAllCalls.push(options);
        return this.rows as CacheModelOf<TType>[];
    }
    async delete(): Promise<void> {
        // Unused by clearByChannelId, which deletes in one batch through `deleteAll`.
        return undefined;
    }
    async deleteAll(ids: string[]): Promise<void> {
        this.deleted.push(ids);
    }
    async clearAll(): Promise<void> {
        // The channel-scoped path must never fall back to wiping the table — a call here would be
        // the bug, so the stub records nothing and the assertions read `deleted` instead.
        return undefined;
    }
}

describe('BaseDbAdapter.clearByChannelId — 채널 한정 폴백 (ADR-0067)', () => {
    it('chat은 채널로 좁혀 읽고 그 채널의 행만 지운다', async () => {
        const adapter = new RecordingAdapter('chat', [
            { id: 'm-1', channelId: 'ch-1' },
            { id: 'm-2', channelId: 'ch-1' },
        ]);

        await adapter.clearByChannelId('ch-1');

        // Without a scoped read, clearing out one room would send the whole scope's chats across the bridge.
        expect(adapter.loadAllCalls).toEqual([{ channelId: 'ch-1' }]);
        expect(adapter.deleted).toEqual([['m-1', 'm-2']]);
    });

    it('join도 channelId 쿼리를 쓴다', async () => {
        const adapter = new RecordingAdapter('join', [{ id: 'ch-1@me', channelId: 'ch-1' }]);

        await adapter.clearByChannelId('ch-1');

        expect(adapter.loadAllCalls).toEqual([{ channelId: 'ch-1' }]);
    });

    it('channelId 쿼리가 없는 도메인은 예전처럼 전량을 훑는다', async () => {
        const adapter = new RecordingAdapter('user', [{ id: 'u-1' }]);

        await adapter.clearByChannelId('ch-1');

        expect(adapter.loadAllCalls).toEqual([undefined]);
        expect(adapter.deleted).toEqual([]);
    });

    it('좁혀 읽은 결과도 channelId로 한 번 더 거른다', async () => {
        // A store may ignore the filter (it varies by implementation) — deletion always targets only rows that pass this check.
        const adapter = new RecordingAdapter('chat', [
            { id: 'm-1', channelId: 'ch-1' },
            { id: 'm-2', channelId: 'ch-other' },
        ]);

        await adapter.clearByChannelId('ch-1');

        expect(adapter.deleted).toEqual([['m-1']]);
    });
});
