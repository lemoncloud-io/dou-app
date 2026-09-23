import { PlaceSocketDataSource } from './PlaceSocketDataSource';
import { createMockSocketGateways, type MockSocketGatewayBundle } from '../gateways/__mocks__/MockSocketGateways';
import type { DataContext } from '../../repositories/types';
import type { UserMySiteInput } from '@lemoncloud/chatic-sockets-api';

describe('PlaceSocketDataSource', () => {
    let mockGateways: MockSocketGatewayBundle;
    let dataSource: PlaceSocketDataSource;
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };

    beforeEach(() => {
        mockGateways = createMockSocketGateways();
        dataSource = new PlaceSocketDataSource(mockGateways.place);
    });

    describe('outbound pipeline (Request)', () => {
        it('fetchPlace sends the request as the user.my-site action', async () => {
            const payload: UserMySiteInput = {};
            await dataSource.fetchPlace(payload, context);
            expect(mockGateways.place.mySite).toHaveBeenCalledWith(payload);
        });

        it('createPlace sends the request as the place.create action', async () => {
            const payload = { name: 'New Place' } as never;
            await dataSource.createPlace(payload, context);
            expect(mockGateways.place.create).toHaveBeenCalledWith(payload);
        });

        it('updatePlace sends the request as the place.update action', async () => {
            const payload = { id: 'place-1', name: 'Updated' } as never;
            await dataSource.updatePlace(payload, context);
            expect(mockGateways.place.update).toHaveBeenCalledWith(payload);
        });
    });

    describe('inbound mapping (View → Domain)', () => {
        it('maps the fetchPlace response to domain places and stamps cid from the context', async () => {
            (mockGateways.place.mySite as jest.Mock).mockResolvedValue({
                list: [{ id: 'place-1', type: 'site' }],
                total: 1,
            });

            const result = await dataSource.fetchPlace({}, context);

            expect(result.list[0]).toMatchObject({ id: 'place-1', cid: 'cloud-a', type: 'site' });
            expect(result.meta.source).toBe('remote');
        });

        it('maps the createPlace response to a single domain place', async () => {
            (mockGateways.place.create as jest.Mock).mockResolvedValue({ id: 'place-9' });

            const domain = await dataSource.createPlace({} as never, context);

            expect(domain).toMatchObject({ id: 'place-9', cid: 'cloud-a' });
        });

        it('uses site$.id as the place id when the createPlace response wraps an owner profile', async () => {
            // The actual response to place.create is the newly created owner profile, and the site itself
            // arrives embedded in `site$`. Using the top-level `id` (the profile id) as is makes a later
            // place.get look up an id that does not exist and return 404.
            (mockGateways.place.create as jest.Mock).mockResolvedValue({
                id: '1000002',
                name: 'whatever',
                thumbnail: 'data:image/jpeg;base64,...',
                siteId: '10026',
                site$: { id: '10026', name: 'ㅇㅇ', ownerId: '1000002' },
            });

            const domain = await dataSource.createPlace({} as never, context);

            expect(domain).toMatchObject({ id: '10026', cid: 'cloud-a', ownerId: '1000002' });
        });
    });
});
