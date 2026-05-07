import { InviteCloudRepository } from './InviteCloudRepository';

describe('InviteCloudRepository', () => {
    const createRepository = () => {
        const local = {
            saveInviteCloud: jest.fn(),
            getInviteCloud: jest.fn(),
            getInviteClouds: jest.fn(),
            deleteInviteCloud: jest.fn(),
            deleteInviteClouds: jest.fn(),
            updateInviteCloudPartial: jest.fn(),
            clearAll: jest.fn(),
            subscribeInviteClouds: jest.fn(() => () => undefined),
            subscribeInviteCloud: jest.fn(() => () => undefined),
        };

        const requestManager = {
            request: jest.fn(),
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

        const repository = new InviteCloudRepository(
            local as any,
            requestManager as any,
            contextProvider,
            domainEventBus as any
        );

        return { repository, local };
    };

    it('delegates save/get/delete/update APIs to local data source', async () => {
        const { repository, local } = createRepository();

        await repository.saveInviteCloud('i1', { name: 'Cloud One' } as any);
        await repository.getInviteCloud('i1');
        await repository.getInviteClouds();
        await repository.updateInviteCloudPartial('i1', { name: 'Cloud Two' } as any);
        await repository.deleteInviteCloud('i1');
        await repository.deleteInviteClouds(['i1']);
        await repository.clearAll();

        expect(local.saveInviteCloud).toHaveBeenCalledWith('i1', { name: 'Cloud One' });
        expect(local.getInviteCloud).toHaveBeenCalledWith('i1');
        expect(local.getInviteClouds).toHaveBeenCalled();
        expect(local.updateInviteCloudPartial).toHaveBeenCalledWith('i1', { name: 'Cloud Two' });
        expect(local.deleteInviteCloud).toHaveBeenCalledWith('i1');
        expect(local.deleteInviteClouds).toHaveBeenCalledWith(['i1']);
        expect(local.clearAll).toHaveBeenCalled();
    });

    it('delegates stream subscriptions to local data source', () => {
        const { repository, local } = createRepository();
        const listCallback = jest.fn();
        const itemCallback = jest.fn();

        repository.subscribeInviteClouds(listCallback);
        repository.subscribeInviteCloud('i1', itemCallback);

        expect(local.subscribeInviteClouds).toHaveBeenCalledWith(listCallback);
        expect(local.subscribeInviteCloud).toHaveBeenCalledWith('i1', itemCallback);
    });
});
