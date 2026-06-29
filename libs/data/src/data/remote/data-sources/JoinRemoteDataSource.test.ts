import { JoinRemoteDataSource } from './JoinRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { DataContext } from '../../repositories-v2/types';
import type { ChannelJoinInput, ChatReadInput } from '@lemoncloud/chatic-sockets-api';

describe('JoinRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: JoinRemoteDataSource;
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'user-1' };

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new JoinRemoteDataSource(mockGateways.join);
    });

    describe('발신(Send) 파이프라인 검증 (Request)', () => {
        it('getJoin 호출 시 join.get 액션으로 request가 전송되어야 한다', async () => {
            const payload = { id: 'ch-1@user-1' };
            await dataSource.getJoin(payload, context);
            expect(mockGateways.join.get).toHaveBeenCalledWith(payload);
        });

        it('readChat 호출 시 chat.read 액션으로 request가 전송되어야 한다', async () => {
            const payload: ChatReadInput = { channelId: 'ch-1', readNo: 5 } as any;
            await dataSource.readChat(payload, context);
            expect(mockGateways.join.read).toHaveBeenCalledWith(payload);
        });

        it('updateJoin 호출 시 join.update 액션으로 request가 전송되어야 한다', async () => {
            const payload = { id: 'ch-1@user-1', nick: 'new-nick' };
            await dataSource.updateJoin(payload, context);
            expect(mockGateways.join.update).toHaveBeenCalledWith(payload);
        });

        it('joinChannel 호출 시 channel.join 액션으로 request가 전송되어야 한다', async () => {
            const payload: ChannelJoinInput = { channelId: 'ch-1' };
            await dataSource.joinChannel(payload, context);
            expect(mockGateways.join.join).toHaveBeenCalledWith(payload);
        });
    });

    describe('수신(Receive) 매핑 검증 (View → Domain)', () => {
        it('getJoin 응답을 도메인 join으로 변환하고 context의 cid를 부여한다', async () => {
            (mockGateways.join.get as jest.Mock).mockResolvedValue({
                id: 'ch-1@user-1',
                channelId: 'ch-1',
                userId: 'user-1',
                readNo: 4,
            });

            const domain = await dataSource.getJoin({ id: 'ch-1@user-1' }, context);

            expect(domain).toMatchObject({ id: 'ch-1@user-1', cid: 'cloud-a', channelId: 'ch-1', readNo: 4 });
        });
    });
});
