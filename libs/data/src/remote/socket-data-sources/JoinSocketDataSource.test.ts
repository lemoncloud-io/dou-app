import { JoinSocketDataSource } from './JoinSocketDataSource';
import { createMockSocketGateways, type MockSocketGatewayBundle } from '../gateways/__mocks__/MockSocketGateways';
import type { DataContext } from '../../repositories/types';
import type { ChannelJoinInput, ChatReadInput } from '@lemoncloud/chatic-sockets-api';

describe('JoinSocketDataSource', () => {
    let mockGateways: MockSocketGatewayBundle;
    let dataSource: JoinSocketDataSource;
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'user-1' };

    beforeEach(() => {
        mockGateways = createMockSocketGateways();
        dataSource = new JoinSocketDataSource(mockGateways.join);
    });

    describe('outbound pipeline (Request)', () => {
        it('getJoin sends the request as the join.get action', async () => {
            const payload = { id: 'ch-1@user-1' };
            await dataSource.getJoin(payload, context);
            expect(mockGateways.join.get).toHaveBeenCalledWith(payload);
        });

        it('readChat sends the request as the chat.read action', async () => {
            const payload: ChatReadInput = { channelId: 'ch-1', readNo: 5 } as any;
            await dataSource.readChat(payload, context);
            expect(mockGateways.join.read).toHaveBeenCalledWith(payload);
        });

        it('updateJoin sends the request as the join.update action', async () => {
            const payload = { id: 'ch-1@user-1', nick: 'new-nick' };
            await dataSource.updateJoin(payload, context);
            expect(mockGateways.join.update).toHaveBeenCalledWith(payload);
        });

        it('joinChannel sends the request as the channel.join action', async () => {
            const payload: ChannelJoinInput = { channelId: 'ch-1' };
            await dataSource.joinChannel(payload, context);
            expect(mockGateways.join.join).toHaveBeenCalledWith(payload);
        });
    });

    describe('inbound mapping (View → Domain)', () => {
        it('maps the getJoin response to a domain join and stamps cid from the context', async () => {
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
