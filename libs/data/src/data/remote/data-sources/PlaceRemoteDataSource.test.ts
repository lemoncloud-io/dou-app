import { PlaceRemoteDataSource } from './PlaceRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { UserMySiteInput } from '@lemoncloud/chatic-sockets-api';

describe('PlaceRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: PlaceRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new PlaceRemoteDataSource(mockGateways.place);
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
});
