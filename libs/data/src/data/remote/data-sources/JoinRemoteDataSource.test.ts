import { JoinRemoteDataSource } from './JoinRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { ChannelJoinInput, ChannelUpdateJoinInput, ChatReadInput } from '@lemoncloud/chatic-sockets-api';

describe('JoinRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: JoinRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new JoinRemoteDataSource(mockGateways.join);
    });

    it('readChat 호출 시 chat.read 액션으로 request가 전송되어야 한다', async () => {
        const payload: ChatReadInput = { channelId: 'ch-1', readNo: 5 } as any;
        await dataSource.readChat(payload);
        expect(mockGateways.join.read).toHaveBeenCalledWith(payload);
    });

    it('updateJoin 호출 시 channel.update-join 액션으로 request가 전송되어야 한다', async () => {
        const payload: ChannelUpdateJoinInput = { channelId: 'ch-1', nick: 'new-nick' };
        await dataSource.updateJoin(payload);
        expect(mockGateways.join.updateJoin).toHaveBeenCalledWith(payload);
    });

    it('joinChannel 호출 시 channel.join 액션으로 request가 전송되어야 한다', async () => {
        const payload: ChannelJoinInput = { channelId: 'ch-1' };
        await dataSource.joinChannel(payload);
        expect(mockGateways.join.join).toHaveBeenCalledWith(payload);
    });
});
