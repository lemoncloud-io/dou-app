import { ChannelRepository } from './ChannelRepository';

describe('ChannelRepository', () => {
    const payload = { page: 0, limit: 20 } as any;

    const createRepository = ({ localResult }: { localResult: any | null }) => {
        const remote = {
            fetchChannel: jest.fn(),
            updateChannel: jest.fn(),
            deleteChannel: jest.fn(),
            startChat: jest.fn(),
            inviteChannel: jest.fn(),
            leaveChannel: jest.fn(),
        };

        const local = {
            fetchChannel: jest.fn(async () => localResult),
            getChannel: jest.fn(),
            upsertChannel: jest.fn(),
            upsertChannels: jest.fn(),
            deleteChannel: jest.fn(),
            deleteChannels: jest.fn(),
            updateChannelPartial: jest.fn(),
            clearAll: jest.fn(),
            subscribeChannelList: jest.fn(() => () => undefined),
            subscribeChannel: jest.fn(() => () => undefined),
        };

        const requestManager = {
            request: jest.fn(async (sendAction: (ref: string) => void) => {
                sendAction('ref-1');
                return {
                    list: [{ id: 'r1', sid: 'place-a', cid: 'cloud-a' }],
                    total: 1,
                };
            }),
        };

        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', uid: 'user-a', sid: 'place-a' }),
            setContext: () => undefined,
        };

        const domainEventBus = {
            on: jest.fn(() => () => undefined),
            emit: jest.fn(),
            onAny: jest.fn(() => () => undefined),
        };

        const repository = new ChannelRepository(
            remote as any,
            local as any,
            requestManager as any,
            contextProvider,
            domainEventBus as any
        );

        return { repository, remote, local, requestManager };
    };

    it('returns local first for cache-first and runs remote refresh in background', async () => {
        const localResult = { list: [{ id: 'l1' }], total: 1 };
        const { repository, remote, requestManager } = createRepository({ localResult });

        const result = await repository.fetchChannel(payload, { cachePolicy: 'cache-first' });

        expect(result).toEqual(localResult);
        await Promise.resolve();
        expect(remote.fetchChannel).toHaveBeenCalledTimes(1);
        expect(requestManager.request).toHaveBeenCalledTimes(1);
    });

    it('delegates subscribeChannels to local data source with repository context', () => {
        const { repository, local } = createRepository({ localResult: null });
        const callback = jest.fn();

        repository.subscribeChannels(payload, callback);

        expect(local.subscribeChannelList).toHaveBeenCalledWith(payload, callback, {
            cid: 'cloud-a',
            uid: 'user-a',
            sid: 'place-a',
        });
    });

    it('delegates clearAll to local data source with repository context', async () => {
        const { repository, local } = createRepository({ localResult: null });

        await repository.clearAll();

        expect(local.clearAll).toHaveBeenCalledWith({ cid: 'cloud-a', uid: 'user-a', sid: 'place-a' });
    });
});
