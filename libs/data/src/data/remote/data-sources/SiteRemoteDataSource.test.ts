import { SiteRemoteDataSource } from './SiteRemoteDataSource';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap, SocketEventMap } from '../../events/types';

describe('SiteRemoteDataSource', () => {
    let mockSocketEventBus: jest.Mocked<IEventBus<SocketEventMap>>;
    let mockDomainEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
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

        dataSource = new SiteRemoteDataSource(mockSocketEventBus, mockDomainEventBus);
    });

    it('site:read 수신 시 site:list 로 정제하여 발행해야 한다', () => {
        const mockDetail = { cid: 'c-1', ref: 'r-1', payload: { list: [], total: 0 } };
        socketCallbacks['site:read'](mockDetail);

        expect(mockDomainEventBus.emit).toHaveBeenCalledWith('site:list', {
            data: mockDetail.payload,
            ref: 'r-1',
            cid: 'c-1',
        });
    });
});
