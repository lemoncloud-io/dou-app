import { PlaceRemoteDataSource } from './PlaceRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { DataContext } from '../../repositories-v2/types';
import type { UserMySiteInput } from '@lemoncloud/chatic-sockets-api';

describe('PlaceRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: PlaceRemoteDataSource;
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new PlaceRemoteDataSource(mockGateways.place);
    });

    describe('발신(Send) 파이프라인 검증 (Request)', () => {
        it('fetchPlace 호출 시 user.my-site 액션으로 request가 전송되어야 한다', async () => {
            const payload: UserMySiteInput = {};
            await dataSource.fetchPlace(payload, context);
            expect(mockGateways.place.mySite).toHaveBeenCalledWith(payload);
        });

        it('createPlace 호출 시 place.create 액션으로 request가 전송되어야 한다', async () => {
            const payload = { name: 'New Place' } as never;
            await dataSource.createPlace(payload, context);
            expect(mockGateways.place.create).toHaveBeenCalledWith(payload);
        });

        it('updatePlace 호출 시 place.update 액션으로 request가 전송되어야 한다', async () => {
            const payload = { id: 'place-1', name: 'Updated' } as never;
            await dataSource.updatePlace(payload, context);
            expect(mockGateways.place.update).toHaveBeenCalledWith(payload);
        });

        it('deletePlace 호출 시 place.delete 액션으로 request가 전송되어야 한다', async () => {
            const payload = { id: 'place-1' } as never;
            await dataSource.deletePlace(payload, context);
            expect(mockGateways.place.delete).toHaveBeenCalledWith(payload);
        });
    });

    describe('수신(Receive) 매핑 검증 (View → Domain)', () => {
        it('fetchPlace 응답을 도메인 place 목록으로 변환하고 context의 cid를 부여한다', async () => {
            (mockGateways.place.mySite as jest.Mock).mockResolvedValue({
                list: [{ id: 'place-1', type: 'site' }],
                total: 1,
            });

            const result = await dataSource.fetchPlace({}, context);

            expect(result.list[0]).toMatchObject({ id: 'place-1', cid: 'cloud-a', type: 'site' });
            expect(result.meta.source).toBe('remote');
        });

        it('createPlace 응답을 단일 도메인 place로 변환한다', async () => {
            (mockGateways.place.create as jest.Mock).mockResolvedValue({ id: 'place-9' });

            const domain = await dataSource.createPlace({} as never, context);

            expect(domain).toMatchObject({ id: 'place-9', cid: 'cloud-a' });
        });
    });
});
