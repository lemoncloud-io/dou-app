import { CloudRepository } from './CloudRepository';
import type { CloudUpdateInput } from '@lemoncloud/chatic-sockets-api';

describe('CloudRepository', () => {
    const createRepository = () => {
        const remote = {
            updateCloud: jest.fn().mockResolvedValue({ status: 'ok' }),
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

        const repository = new CloudRepository(remote as any, contextProvider, domainEventBus as any);

        return { repository, remote };
    };

    it('updateCloud 호출 시 remoteDataSource.updateCloud를 호출해야 한다', async () => {
        const { repository, remote } = createRepository();
        const payload: CloudUpdateInput = { cloudId: 'cloud-a', name: 'My Cloud' };

        const result = await repository.updateCloud(payload);

        expect(remote.updateCloud).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ status: 'ok' });
    });
});
