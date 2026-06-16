import { SiteRemoteDataSource } from './SiteRemoteDataSource';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap, SocketEventMap } from '../../events/types';
import type { IWebSocketClient } from '../clients';

describe('SiteRemoteDataSource', () => {
    let mockSocketEventBus: jest.Mocked<IEventBus<SocketEventMap>>;
    let mockDomainEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
    let mockWssClient: jest.Mocked<IWebSocketClient>;
    let dataSource: SiteRemoteDataSource;
    let socketCallbacks: Record<string, (data: any) => void> = {};

    beforeEach(() => {
        socketCallbacks = {};
        mockSocketEventBus = {
            emit: jest.fn(),
            on: jest.fn().mockImplementation((event, callback) => {
                socketCallbacks[event as string] = callback;
                return jest.fn();
            }),
            onAny: jest.fn(),
        } as unknown as jest.Mocked<IEventBus<SocketEventMap>>;

        mockDomainEventBus = { emit: jest.fn() } as unknown as jest.Mocked<IEventBus<DomainEventMap>>;
        mockWssClient = { send: jest.fn() } as unknown as jest.Mocked<IWebSocketClient>;

        dataSource = new SiteRemoteDataSource(mockSocketEventBus, mockDomainEventBus, mockWssClient);
    });

    it('site:read 수신 시 site:list 로 정제하여 발행해야 한다', () => {
        const mockDetail = { ref: 'r-1', payload: { list: [], total: 0 } };
        socketCallbacks['site:read'](mockDetail);

        expect(mockDomainEventBus.emit).toHaveBeenCalledWith('site:list', {
            data: mockDetail.payload,
            ref: 'r-1',
        });
    });

    it('site:create 수신 시 site:create 로 정제하여 발행해야 한다', () => {
        const mockDetail = { ref: 'r-create', payload: { id: 'site-1', name: 'Workspace' } };
        socketCallbacks['site:create'](mockDetail);

        expect(mockDomainEventBus.emit).toHaveBeenCalledWith('site:create', {
            data: mockDetail.payload,
            ref: 'r-create',
        });
    });

    it('fetchSite 호출 시 user 도메인의 my-site 액션으로 전송되어야 한다', () => {
        const payload = { limit: 20 };

        dataSource.fetchSite(payload, 'site-list-ref');

        expect(mockWssClient.send).toHaveBeenCalledWith('user', 'my-site', payload, 'site-list-ref');
    });

    it('createSite 호출 시 user 도메인의 make-site 액션으로 전송되어야 한다', () => {
        const payload = { name: 'Workspace' };

        dataSource.createSite(payload, 'site-create-ref');

        expect(mockWssClient.send).toHaveBeenCalledWith('user', 'make-site', payload, 'site-create-ref');
    });

    it('updateSite 호출 시 user 도메인의 update-site 액션으로 전송되어야 한다', () => {
        const payload = { sid: 'site-1', name: 'Renamed' };

        dataSource.updateSite(payload, 'site-update-ref');

        expect(mockWssClient.send).toHaveBeenCalledWith('user', 'update-site', payload, 'site-update-ref');
    });
});
