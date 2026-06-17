import { SiteRemoteDataSource } from './SiteRemoteDataSource';
import { MockSocketClient } from '../sockets/__mocks__/MockSocketClient';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type { UserMySiteInput, UserMakeSiteInput, UserUpdateSiteInput } from '@lemoncloud/chatic-sockets-api';

describe('SiteRemoteDataSource', () => {
    let mockClient: MockSocketClient;
    let mockDomainEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
    let dataSource: SiteRemoteDataSource;

    beforeEach(() => {
        mockClient = new MockSocketClient();
        mockDomainEventBus = {
            emit: jest.fn(),
            on: jest.fn(),
            onAny: jest.fn(),
        } as unknown as jest.Mocked<IEventBus<DomainEventMap>>;

        dataSource = new SiteRemoteDataSource(mockDomainEventBus, mockClient);
    });

    it('fetchSite 호출 시 user.my-site 액션으로 request가 전송되어야 한다', async () => {
        const payload: UserMySiteInput = {};
        await dataSource.fetchSite(payload);
        expect(mockClient.request).toHaveBeenCalledWith('user.my-site', payload);
    });

    it('createSite 호출 시 user.make-site 액션으로 request가 전송되어야 한다', async () => {
        const payload: UserMakeSiteInput = { name: 'New Site' };
        await dataSource.createSite(payload);
        expect(mockClient.request).toHaveBeenCalledWith('user.make-site', payload);
    });

    it('updateSite 호출 시 user.update-site 액션으로 request가 전송되어야 한다', async () => {
        const payload: UserUpdateSiteInput = { sid: 'site-1', name: 'Updated' };
        await dataSource.updateSite(payload);
        expect(mockClient.request).toHaveBeenCalledWith('user.update-site', payload);
    });

    it('handleModelEvent("create", data) 호출 시 site:create를 emit 해야 한다', () => {
        const data = { id: 'site-1', name: 'New Site' };
        dataSource.handleModelEvent('create', data);
        expect(mockDomainEventBus.emit).toHaveBeenCalledWith('site:create', { data });
    });
});
