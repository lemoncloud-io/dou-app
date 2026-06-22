import { PlaceRemoteDataSource } from './PlaceRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type { UserMySiteInput } from '@lemoncloud/chatic-sockets-api';

describe('PlaceRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let mockDomainEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
    let dataSource: PlaceRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        mockDomainEventBus = {
            emit: jest.fn(),
            on: jest.fn(),
            onAny: jest.fn(),
        } as unknown as jest.Mocked<IEventBus<DomainEventMap>>;

        dataSource = new PlaceRemoteDataSource(mockDomainEventBus, mockGateways.place);
    });

    it('fetchPlace 호출 시 user.my-site 액션으로 request가 전송되어야 한다', async () => {
        const payload: UserMySiteInput = {};
        await dataSource.fetchPlace(payload);
        expect(mockGateways.place.mySite).toHaveBeenCalledWith(payload);
    });

    it('createPlace 호출 시 place.create 액션으로 request가 전송되어야 한다', async () => {
        const payload = { name: 'New Place' } as never;
        await dataSource.createPlace(payload);
        expect(mockGateways.place.create).toHaveBeenCalledWith(payload);
    });

    it('updatePlace 호출 시 place.update 액션으로 request가 전송되어야 한다', async () => {
        const payload = { id: 'place-1', name: 'Updated' } as never;
        await dataSource.updatePlace(payload);
        expect(mockGateways.place.update).toHaveBeenCalledWith(payload);
    });

    it('deletePlace 호출 시 place.delete 액션으로 request가 전송되어야 한다', async () => {
        const payload = { id: 'place-1' } as never;
        await dataSource.deletePlace(payload);
        expect(mockGateways.place.delete).toHaveBeenCalledWith(payload);
    });

    it('handleModelEvent("create", data) 호출 시 place:create를 emit 해야 한다', () => {
        const data = { id: 'place-1', name: 'New Place' };
        dataSource.handleModelEvent('create', data);
        expect(mockDomainEventBus.emit).toHaveBeenCalledWith('place:create', { data });
    });
});
