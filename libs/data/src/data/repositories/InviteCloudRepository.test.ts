import { InviteCloudRepository } from './InviteCloudRepository';

describe('InviteCloudRepository', () => {
    const createRepository = () => {
        const local = {
            fetchList: jest.fn(),
            getById: jest.fn(),
            upsert: jest.fn(),
            upsertMany: jest.fn(),
            remove: jest.fn(),
            removeMany: jest.fn(),
            clearAll: jest.fn(),
            subscribeList: jest.fn(() => () => undefined),
            subscribeItem: jest.fn(() => () => undefined),
        };

        const requestManager = { request: jest.fn() };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', uid: 'user-a' }),
            setContext: () => undefined,
        };
        const domainEventBus = {
            on: jest.fn(() => () => undefined),
            emit: jest.fn(),
            onAny: jest.fn(() => () => undefined),
        };

        const repository = new InviteCloudRepository(
            local as any,
            requestManager as any,
            contextProvider,
            domainEventBus as any
        );

        return { repository, local };
    };

    it('delegates APIs to local data source using common interface', async () => {
        const { repository, local } = createRepository();

        await repository.saveInviteCloud('i1', { name: 'Cloud One' } as any);
        await repository.getInviteCloud('i1');
        await repository.getInviteClouds();
        await repository.updateInviteCloudPartial('i1', { name: 'Cloud Two' } as any);
        await repository.deleteInviteCloud('i1');
        await repository.deleteInviteClouds(['i1']);
        await repository.clearAll();

        // 💡 수정: 공통화된 인터페이스 호출 검증
        expect(local.upsert).toHaveBeenCalledWith({ id: 'i1', name: 'Cloud One' }, { cid: 'cloud-a', uid: 'user-a' });
        expect(local.getById).toHaveBeenCalledWith('i1', { cid: 'cloud-a', uid: 'user-a' });
        expect(local.fetchList).toHaveBeenCalled();
        expect(local.upsert).toHaveBeenCalledWith({ id: 'i1', name: 'Cloud Two' }, { cid: 'cloud-a', uid: 'user-a' });
        expect(local.remove).toHaveBeenCalledWith('i1', { cid: 'cloud-a', uid: 'user-a' });
        expect(local.removeMany).toHaveBeenCalledWith(['i1'], { cid: 'cloud-a', uid: 'user-a' });
        expect(local.clearAll).toHaveBeenCalled();
    });

    it('delegates stream subscriptions to local data source', () => {
        const { repository, local } = createRepository();
        const listCallback = jest.fn();
        const itemCallback = jest.fn();

        repository.subscribeList(listCallback);
        repository.subscribeItem('i1', itemCallback);

        expect(local.subscribeList).toHaveBeenCalled();
        expect(local.subscribeItem).toHaveBeenCalled();
    });
});
