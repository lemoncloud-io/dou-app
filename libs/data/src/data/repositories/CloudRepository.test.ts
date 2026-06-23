import { CloudRepository } from './CloudRepository';
import type { CloudUpdateInput } from '@lemoncloud/chatic-sockets-api';

describe('CloudRepository', () => {
    const createRepository = () => {
        const remote = {
            getCloud: jest.fn().mockResolvedValue({ id: 'cloud-a', name: 'My Cloud' }),
            updateCloud: jest.fn().mockResolvedValue({ status: 'ok' }),
            deleteCloud: jest.fn().mockResolvedValue({ id: 'cloud-a', deletedAt: 1 }),
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

    it('getCloud 호출 시 remoteDataSource.getCloud를 호출해야 한다', async () => {
        const { repository, remote } = createRepository();
        const payload = { cloudId: 'cloud-a' } as any;

        const result = await repository.getCloud(payload);

        expect(remote.getCloud).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ id: 'cloud-a', name: 'My Cloud' });
    });

    it('updateCloud 호출 시 remoteDataSource.updateCloud를 호출해야 한다', async () => {
        const { repository, remote } = createRepository();
        const payload: CloudUpdateInput = { cloudId: 'cloud-a', name: 'My Cloud' };

        const result = await repository.updateCloud(payload);

        expect(remote.updateCloud).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ status: 'ok' });
    });

    it('deleteCloud 호출 시 remoteDataSource.deleteCloud를 호출해야 한다', async () => {
        const { repository, remote } = createRepository();
        const payload = { cloudId: 'cloud-a' } as any;

        const result = await repository.deleteCloud(payload);

        expect(remote.deleteCloud).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ id: 'cloud-a', deletedAt: 1 });
    });
});
