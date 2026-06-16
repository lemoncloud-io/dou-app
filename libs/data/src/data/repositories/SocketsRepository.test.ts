import { SocketsRepository } from './SocketsRepository';
import type { SocketsFindConnectionInput } from '@lemoncloud/chatic-sockets-api';

describe('SocketsRepository', () => {
    const createRepository = () => {
        const remote = {
            findConnection: jest.fn().mockResolvedValue({ connectionId: 'conn-1', connectedAt: 123456 }),
        };

        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', uid: 'user-a' }),
            setContext: () => undefined,
        };

        const domainEventBus = {
            on: jest.fn(() => () => undefined),
            emit: jest.fn(),
            onAny: jest.fn(() => () => undefined),
        };

        const repository = new SocketsRepository(remote as any, contextProvider, domainEventBus as any);

        return { repository, remote };
    };

    it('findConnection 호출 시 remoteDataSource.findConnection을 호출해야 한다', async () => {
        const { repository, remote } = createRepository();
        const payload: SocketsFindConnectionInput = { event: { connectionId: 'conn-1' } } as any;

        const result = await repository.findConnection(payload);

        expect(remote.findConnection).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ connectionId: 'conn-1', connectedAt: 123456 });
    });
});
