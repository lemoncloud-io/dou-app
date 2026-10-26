import { ACCOUNT_CHANNEL_SID } from '../../domain';
import { ChannelLocalDataSource } from './ChannelLocalDataSource';
import { createPartitionedMemoryStorage } from './__mocks__/MemoryCacheStorage';

describe('ChannelLocalDataSource', () => {
    const contextProvider = {
        current: { cid: 'cloud-a', sid: 'site-1', uid: 'me' },
        getContext() {
            return this.current;
        },
        setContext(context: any) {
            this.current = context;
        },
    };

    it('filters channels by the active place and sorts by id ascending', async () => {
        const storage = createPartitionedMemoryStorage('channel');
        const dataSource = new ChannelLocalDataSource(contextProvider as any, storage);

        // Seed two channels for the active place and one for another place.
        // The local cache orders by id, not by activity.
        await dataSource.cacheWriteMany([
            { id: 'ch-2', sid: 'site-1', name: 'Newer' } as any,
            { id: 'ch-1', sid: 'site-1', name: 'Older' } as any,
            { id: 'ch-3', sid: 'site-2', name: 'Other place' } as any,
        ]);

        const result = await dataSource.cacheReadList({ sid: 'site-1' } as any);

        // Only the requested place should remain, ordered by id (not by latest activity).
        expect(result?.list.map(item => item.id)).toEqual(['ch-1', 'ch-2']);
    });

    it('sorts channel ids numerically (10 after 2, not lexicographically)', async () => {
        const storage = createPartitionedMemoryStorage('channel');
        const dataSource = new ChannelLocalDataSource(contextProvider as any, storage);

        await dataSource.cacheWriteMany([
            { id: '10', sid: 'site-1', name: 'Ten' } as any,
            { id: '2', sid: 'site-1', name: 'Two' } as any,
            { id: '1', sid: 'site-1', name: 'One' } as any,
        ]);

        const result = await dataSource.cacheReadList({ sid: 'site-1' } as any);

        expect(result?.list.map(item => item.id)).toEqual(['1', '2', '10']);
    });

    it('removes deleted channels from later reads so bulk list consumers do not see stale entries', async () => {
        const storage = createPartitionedMemoryStorage('channel');
        const dataSource = new ChannelLocalDataSource(contextProvider as any, storage);

        await dataSource.cacheWriteMany([
            { id: 'ch-1', sid: 'site-1', name: 'Keep' } as any,
            { id: 'ch-2', sid: 'site-1', name: 'Delete' } as any,
        ]);
        await dataSource.cacheDelete('ch-2');

        const result = await dataSource.cacheReadList({ sid: 'site-1' } as any);

        // Deletes must affect subsequent list reads so higher layers never see resurrected channels.
        expect(result?.list.map(item => item.id)).toEqual(['ch-1']);
    });

    // The channel cache is cloud-wide, so the observer scope must key by {cid, uid} only — NOT the
    // transient active sid. Otherwise a cloud/site switch (which changes the provider sid) reemits
    // under a scope the cloud-wide observer never subscribed to, and the rail stays stale until a
    // manual refresh (the P1 bug). This locks the sid-independent reemit routing.
    describe('cloud-wide reemit routing is sid-independent (P1)', () => {
        const flush = () => jest.advanceTimersByTimeAsync(60); // past the 50ms reemit debounce

        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        it('reemits a cloud-wide observer even when the active sid differs from subscribe time', async () => {
            const storage = createPartitionedMemoryStorage('channel');
            const provider = {
                current: { cid: 'cloud-a', sid: 'site-1', uid: 'me' },
                getContext() {
                    return this.current;
                },
                setContext(c: any) {
                    this.current = c;
                },
            };
            const dataSource = new ChannelLocalDataSource(provider as any, storage);

            const cb = jest.fn();
            // Cloud-wide subscription (sid: '') taken while the active place is site-1.
            dataSource.observeList({ sid: '' } as any, cb);
            await flush();
            cb.mockClear();

            // Active place moves to site-2, then a channel for site-2 is written. A scope keyed by sid
            // would route this reemit to a different key and miss the observer.
            provider.setContext({ cid: 'cloud-a', sid: 'site-2', uid: 'me' });
            await dataSource.cacheWrite({ id: 'ch-9', sid: 'site-2', name: 'New site channel' } as any);
            await flush();

            expect(cb).toHaveBeenCalled();
            expect(cb.mock.calls.at(-1)?.[0]?.list.map((c: any) => c.id)).toContain('ch-9');
        });
    });

    describe('following the parent DataContext (it does not act independently)', () => {
        it('a given contextOverride takes precedence over the provider for cid/sid', async () => {
            const storage = createPartitionedMemoryStorage('channel');
            const dataSource = new ChannelLocalDataSource(contextProvider as any, storage);

            await dataSource.cacheWrite({ id: 'ch-1', name: 'Override' } as any, {
                cid: 'cloud-b',
                sid: 'site-2',
                uid: 'me',
            });

            // The override decides the partition too, so the row is read back under it — the
            // provider's own cloud never saw it.
            const item = await dataSource.cacheRead('ch-1', { cid: 'cloud-b', uid: 'me' });
            expect(item).toMatchObject({ id: 'ch-1', cid: 'cloud-b', sid: 'site-2' });
            await expect(dataSource.cacheRead('ch-1')).resolves.toBeNull();
        });

        it('without an override it follows cid/sid from the provider context', async () => {
            const storage = createPartitionedMemoryStorage('channel');
            const dataSource = new ChannelLocalDataSource(contextProvider as any, storage);

            await dataSource.cacheWrite({ id: 'ch-1', name: 'Provider' } as any);

            const item = await dataSource.cacheRead('ch-1');
            expect(item).toMatchObject({ id: 'ch-1', cid: 'cloud-a', sid: 'site-1' });
        });

        it('throws a clear error when sid is in neither the context nor the item', async () => {
            const storage = createPartitionedMemoryStorage('channel');
            const noSidProvider = {
                getContext: () => ({ cid: 'cloud-a', uid: 'me' }),
                setContext: () => undefined,
            };
            const dataSource = new ChannelLocalDataSource(noSidProvider as any, storage);

            await expect(dataSource.cacheWrite({ id: 'ch-1' } as any)).rejects.toThrow(/sid is required/);
        });
    });

    // A cloud 1:1 belongs to the place the server stamped on it. The active place is the reader's,
    // and during a place switch it already names the next one, so it never fills the field.
    describe('a cloud 1:1 keeps its own place', () => {
        it('keeps the place the row arrived with', async () => {
            const storage = createPartitionedMemoryStorage('channel');
            const dataSource = new ChannelLocalDataSource(contextProvider as any, storage);

            await dataSource.cacheWrite({ id: 'dm-1', stereo: 'dm', sid: 'site-9' } as any);

            expect((await dataSource.cacheRead('dm-1'))?.sid).toBe('site-9');
        });

        it('takes the place a place-keyed id names over the active one', async () => {
            const storage = createPartitionedMemoryStorage('channel');
            const dataSource = new ChannelLocalDataSource(contextProvider as any, storage);

            await dataSource.cacheWrite({ id: 'site-7@u1@u2', stereo: 'dm' } as any);

            expect((await dataSource.cacheRead('site-7@u1@u2'))?.sid).toBe('site-7');
        });

        it('falls back to the cached place for a partial write', async () => {
            const storage = createPartitionedMemoryStorage('channel');
            const dataSource = new ChannelLocalDataSource(contextProvider as any, storage);
            await dataSource.cacheWrite({ id: 'dm-1', stereo: 'dm', sid: 'site-9' } as any);

            await dataSource.cacheWrite({ id: 'dm-1', name: 'renamed' } as any);

            expect((await dataSource.cacheRead('dm-1'))?.sid).toBe('site-9');
        });

        // A row an older build filed under the ambient place is put back where its id says it lives.
        it('lets the place an id names correct a cached place', async () => {
            const storage = createPartitionedMemoryStorage('channel');
            const dataSource = new ChannelLocalDataSource(contextProvider as any, storage);
            await storage.forScope({ cid: 'cloud-a', uid: 'me' }).save('site-7@u1@u2', {
                id: 'site-7@u1@u2',
                cid: 'cloud-a',
                sid: 'site-1',
                stereo: 'dm',
            } as any);

            await dataSource.cacheWrite({ id: 'site-7@u1@u2' } as any);

            expect((await dataSource.cacheRead('site-7@u1@u2'))?.sid).toBe('site-7');
        });

        // An update or invite answer carries no stereo, so the mapper may have filled its place from
        // the context. A pair-key room keeps the place it was cached with.
        it("keeps a pair-key 1:1's cached place over a stereo-less answer's", async () => {
            const storage = createPartitionedMemoryStorage('channel');
            const dataSource = new ChannelLocalDataSource(contextProvider as any, storage);
            await dataSource.cacheWrite({ id: 'u1@u2', stereo: 'dm', sid: 'site-9' } as any);

            await dataSource.cacheWrite({ id: 'u1@u2', sid: 'site-1', name: 'renamed' } as any);

            expect(await dataSource.cacheRead('u1@u2')).toMatchObject({ sid: 'site-9', name: 'renamed' });
        });

        it('is not filed under the active place by a sync', async () => {
            const storage = createPartitionedMemoryStorage('channel');
            const dataSource = new ChannelLocalDataSource(contextProvider as any, storage);

            await dataSource.cacheWriteMany([
                { id: 'site-7@u1@u2', stereo: 'dm' } as any,
                { id: 'u1@u3', stereo: 'dm', $: { sid: 'site-8' } } as any,
            ]);

            expect((await dataSource.cacheRead('site-7@u1@u2'))?.sid).toBe('site-7');
            expect((await dataSource.cacheRead('u1@u3'))?.sid).toBe('site-8');
            expect((await dataSource.cacheReadList({ sid: 'site-1' } as any))?.list).toEqual([]);
        });

        // A room from before 1:1s were keyed by place may name none. Refusing it would fail the whole
        // sync it arrived in; it is stored, and no place lists it.
        it('stores a room that names no place with an empty place instead of refusing it', async () => {
            const storage = createPartitionedMemoryStorage('channel');
            const dataSource = new ChannelLocalDataSource(contextProvider as any, storage);

            await dataSource.cacheWriteMany([{ id: 'u1@u4', stereo: 'dm' } as any, { id: 'g-1' } as any]);

            expect((await dataSource.cacheRead('u1@u4'))?.sid).toBe('');
            expect((await dataSource.cacheRead('g-1'))?.sid).toBe('site-1');
        });

        it('leaves a relay 1:1 on the ordinary chain, active place included', async () => {
            const storage = createPartitionedMemoryStorage('channel');
            const relayProvider = {
                getContext: () => ({ cid: 'default', sid: '0000', uid: 'me' }),
                setContext: () => undefined,
            };
            const dataSource = new ChannelLocalDataSource(relayProvider as any, storage);

            await dataSource.cacheWrite({ id: 'u1@u2', stereo: 'dm' } as any);

            expect((await dataSource.cacheRead('u1@u2'))?.sid).toBe('0000');
        });

        // A sync writes with no active place, and the relay's pair-keyed room may name none. The relay
        // lists such a room in its one place anyway, so refusing it would only fail the whole sync.
        it('stores a relay 1:1 that names no place with an empty place, and still refuses a relay group', async () => {
            const storage = createPartitionedMemoryStorage('channel');
            const relayProvider = {
                getContext: () => ({ cid: 'default', uid: 'me' }),
                setContext: () => undefined,
            };
            const dataSource = new ChannelLocalDataSource(relayProvider as any, storage);

            await dataSource.cacheWriteMany([{ id: 'u1@u5', stereo: 'dm' } as any]);
            await dataSource.cacheWrite({ id: 'u1@u6', stereo: 'dm' } as any);

            expect((await dataSource.cacheRead('u1@u5'))?.sid).toBe('');
            expect((await dataSource.cacheRead('u1@u6'))?.sid).toBe('');
            await expect(dataSource.cacheWrite({ id: 'g-relay', stereo: 'public' } as any)).rejects.toThrow(
                /sid is required/
            );
        });
    });

    // The Self Channel belongs to the account, not a place, and the relay sends it with an empty
    // `$`. Refused for lack of a place, it never reached a desktop user's Home, which has none.
    describe('a Self Channel with no place', () => {
        const noSidProvider = {
            getContext: () => ({ cid: 'default', uid: 'me' }),
            setContext: () => undefined,
        };

        it('is stored under the account', async () => {
            const dataSource = new ChannelLocalDataSource(
                noSidProvider as any,
                createPartitionedMemoryStorage('channel')
            );

            await dataSource.cacheWriteMany([{ id: 'U:me', stereo: 'self', $: {} } as any]);

            expect((await dataSource.cacheRead('U:me'))?.sid).toBe(ACCOUNT_CHANNEL_SID);
        });

        it('keeps a real place once it has one', async () => {
            const dataSource = new ChannelLocalDataSource(
                noSidProvider as any,
                createPartitionedMemoryStorage('channel')
            );
            await dataSource.cacheWrite({ id: 'U:me', stereo: 'self', sid: 'site-1' } as any);

            await dataSource.cacheWriteMany([{ id: 'U:me', stereo: 'self', $: {} } as any]);

            expect((await dataSource.cacheRead('U:me'))?.sid).toBe('site-1');
        });
    });
});
