import { ProfileRemoteDataSource } from './ProfileRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { DataContext } from '../../repositories-v2/types';
import type {
    ProfileGetInput,
    ProfileGetMineInput,
    ProfileSetInput,
    ProfileSyncInput,
} from '@lemoncloud/chatic-sockets-lib';

describe('ProfileRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: ProfileRemoteDataSource;
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new ProfileRemoteDataSource(mockGateways.profile);
    });

    describe('발신(Send) 파이프라인 검증 (Request)', () => {
        it('get 호출 시 profile.get 액션으로 request가 전송되어야 한다', async () => {
            const payload: ProfileGetInput = { id: 'site-1@user-1' };
            mockGateways.profile.get.mockResolvedValue({ siteId: 'site-1', userId: 'user-1', nick: 'nick-1' } as any);
            await dataSource.get(payload, context);
            expect(mockGateways.profile.get).toHaveBeenCalledWith(payload);
        });

        it('getMine 호출 시 profile.get-mine 액션으로 request가 전송되어야 한다', async () => {
            const payload: ProfileGetMineInput = {};
            mockGateways.profile.getMine.mockResolvedValue({ siteId: 'site-1', userId: 'me' } as any);
            await dataSource.getMine(payload, context);
            expect(mockGateways.profile.getMine).toHaveBeenCalledWith(payload);
        });

        it('set 호출 시 profile.set 액션으로 request가 전송되어야 한다', async () => {
            const payload: ProfileSetInput = { siteId: 'site-1', userId: 'me', nick: 'nick-2' } as any;
            mockGateways.profile.set.mockResolvedValue({ siteId: 'site-1', userId: 'me', nick: 'nick-2' } as any);
            await dataSource.set(payload, context);
            expect(mockGateways.profile.set).toHaveBeenCalledWith(payload);
        });

        it('sync 호출 시 profile.sync 액션으로 request가 전송되어야 한다', async () => {
            const payload: ProfileSyncInput = { since: 10 };
            mockGateways.profile.sync.mockResolvedValue({ profiles: {}, syncedAt: 10 } as any);
            await dataSource.sync(payload, context);
            expect(mockGateways.profile.sync).toHaveBeenCalledWith(payload);
        });
    });

    describe('수신(Receive) 매핑 검증 (View → Domain)', () => {
        it('get 응답을 sid@uid 식별자의 도메인 프로필로 변환한다', async () => {
            mockGateways.profile.get.mockResolvedValue({ siteId: 'site-1', userId: 'user-1', nick: 'nick-1' } as any);

            const domain = await dataSource.get({ id: 'site-1@user-1' }, context);

            expect(domain).toMatchObject({ id: 'site-1@user-1', cid: 'cloud-a', sid: 'site-1', uid: 'user-1' });
        });

        it('view에 식별자가 없으면 context의 sid/uid로 보정한다', async () => {
            mockGateways.profile.getMine.mockResolvedValue({ nick: 'mine' } as any);

            const domain = await dataSource.getMine({}, context);

            expect(domain).toMatchObject({ id: 'site-1@me', sid: 'site-1', uid: 'me' });
        });

        it('sync 응답의 delta를 도메인 upserts와 removals로 분리한다', async () => {
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
