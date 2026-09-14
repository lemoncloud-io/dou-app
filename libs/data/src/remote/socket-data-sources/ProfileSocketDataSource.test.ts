import { ProfileSocketDataSource } from './ProfileSocketDataSource';
import { createMockSocketGateways, type MockSocketGatewayBundle } from '../gateways/__mocks__/MockSocketGateways';
import type { DataContext } from '../../repositories/types';
import type {
    ProfileGetInput,
    ProfileGetMineInput,
    ProfileSetInput,
    ProfileSyncInput,
} from '@lemoncloud/chatic-sockets-lib';

describe('ProfileSocketDataSource', () => {
    let mockGateways: MockSocketGatewayBundle;
    let dataSource: ProfileSocketDataSource;
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };

    beforeEach(() => {
        mockGateways = createMockSocketGateways();
        dataSource = new ProfileSocketDataSource(mockGateways.profile);
    });

    describe('outbound pipeline (Request)', () => {
        it('get sends the request as the profile.get action', async () => {
            const payload: ProfileGetInput = { id: 'site-1@user-1' };
            mockGateways.profile.get.mockResolvedValue({ siteId: 'site-1', userId: 'user-1', nick: 'nick-1' } as any);
            await dataSource.get(payload, context);
            expect(mockGateways.profile.get).toHaveBeenCalledWith(payload);
        });

        it('getMine sends the request as the profile.get-mine action', async () => {
            const payload: ProfileGetMineInput = {};
            mockGateways.profile.getMine.mockResolvedValue({ siteId: 'site-1', userId: 'me' } as any);
            await dataSource.getMine(payload, context);
            expect(mockGateways.profile.getMine).toHaveBeenCalledWith(payload);
        });

        it('set sends the request as the profile.set action', async () => {
            const payload: ProfileSetInput = { siteId: 'site-1', userId: 'me', nick: 'nick-2' } as any;
            mockGateways.profile.set.mockResolvedValue({ siteId: 'site-1', userId: 'me', nick: 'nick-2' } as any);
            await dataSource.set(payload, context);
            expect(mockGateways.profile.set).toHaveBeenCalledWith(payload);
        });

        it('sync sends the request as the profile.sync action', async () => {
            const payload: ProfileSyncInput = { since: 10 };
            mockGateways.profile.sync.mockResolvedValue({ profiles: {}, syncedAt: 10 } as any);
            await dataSource.sync(payload, context);
            expect(mockGateways.profile.sync).toHaveBeenCalledWith(payload);
        });
    });

    describe('inbound mapping (View → Domain)', () => {
        it('maps the get response to a domain profile identified by sid@uid', async () => {
            mockGateways.profile.get.mockResolvedValue({ siteId: 'site-1', userId: 'user-1', nick: 'nick-1' } as any);

            const domain = await dataSource.get({ id: 'site-1@user-1' }, context);

            expect(domain).toMatchObject({ id: 'site-1@user-1', cid: 'cloud-a', sid: 'site-1', uid: 'user-1' });
        });

        it('falls back to sid/uid from the context when the view carries no identifier', async () => {
            mockGateways.profile.getMine.mockResolvedValue({ nick: 'mine' } as any);

            const domain = await dataSource.getMine({}, context);

            expect(domain).toMatchObject({ id: 'site-1@me', sid: 'site-1', uid: 'me' });
        });

        it('splits the delta of the sync response into domain upserts and removals', async () => {
            mockGateways.profile.sync.mockResolvedValue({
                profiles: {
                    'user-1': { nick: 'A' },
                    'user-2': null,
                },
                syncedAt: 123,
            } as any);

            const result = await dataSource.sync({ since: 0 }, context);

            expect(result.upserts).toEqual([expect.objectContaining({ id: 'site-1@user-1', cid: 'cloud-a' })]);
            expect(result.removals).toEqual(['site-1@user-2']);
            expect(result.syncedAt).toBe(123);
        });
    });
});
