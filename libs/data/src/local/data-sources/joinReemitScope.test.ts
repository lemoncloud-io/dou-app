import { JoinLocalDataSource } from './JoinLocalDataSource';
import { createPartitionedMemoryStorage } from './__mocks__/MemoryCacheStorage';

const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

const context = { cid: 'cloud-a', uid: 'me', sid: 'site-1' };

const createSource = () => {
    const joins = createPartitionedMemoryStorage('join');
    const source = new JoinLocalDataSource({ getContext: () => context, setContext: () => undefined }, joins);
    return { source, storage: joins.forScope(context) };
};

describe('JoinLocalDataSource re-emit scope', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    const settle = async () => {
        jest.runOnlyPendingTimers();
        await flushPromises();
    };

    it('a write to one channel does not wake the observers of another channel', async () => {
        const { source } = createSource();
        const a = jest.fn();
        const b = jest.fn();

        source.observeList({ channelId: 'ch-a' }, a);
        source.observeList({ channelId: 'ch-b' }, b);
        await settle();
        a.mockClear();
        b.mockClear();

        await source.cacheWrite({ id: 'ch-a@me', channelId: 'ch-a', userId: 'me', readNo: 1 } as any);
        await settle();

        expect(a).toHaveBeenCalled();
        expect(b).not.toHaveBeenCalled();
    });

    it('another channel sharing an id prefix is not woken', async () => {
        const { source } = createSource();
        const one = jest.fn();
        const ten = jest.fn();

        source.observeList({ channelId: 'ch-1' }, one);
        source.observeList({ channelId: 'ch-10' }, ten);
        await settle();
        one.mockClear();
        ten.mockClear();

        await source.cacheWrite({ id: 'ch-1@me', channelId: 'ch-1', userId: 'me', readNo: 1 } as any);
        await settle();

        expect(one).toHaveBeenCalled();
        expect(ten).not.toHaveBeenCalled();
    });

    it('storage is read once even with several observers on the same key', async () => {
        const { source, storage } = createSource();
        const loadAll = jest.spyOn(storage, 'loadAll');
        const a = jest.fn();
        const b = jest.fn();
        const c = jest.fn();

        source.observeList({ channelId: 'ch-a' }, a);
        source.observeList({ channelId: 'ch-a' }, b);
        source.observeList({ channelId: 'ch-a' }, c);
        await settle();

        loadAll.mockClear();
        await source.cacheWrite({ id: 'ch-a@me', channelId: 'ch-a', userId: 'me', readNo: 7 } as any);
        await settle();

        expect(a).toHaveBeenCalled();
        expect(b).toHaveBeenCalled();
        expect(c).toHaveBeenCalled();
        expect(loadAll).toHaveBeenCalledTimes(1);
    });

    it('every query variant on the same channel is woken', async () => {
        const { source } = createSource();
        const plain = jest.fn();
        const activeOnly = jest.fn();

        source.observeList({ channelId: 'ch-a' }, plain);
        source.observeList({ channelId: 'ch-a', activeOnly: true }, activeOnly);
        await settle();
        plain.mockClear();
        activeOnly.mockClear();

        await source.cacheWrite({ id: 'ch-a@me', channelId: 'ch-a', userId: 'me', readNo: 2 } as any);
        await settle();

        expect(plain).toHaveBeenCalled();
        expect(activeOnly).toHaveBeenCalled();
    });
});
