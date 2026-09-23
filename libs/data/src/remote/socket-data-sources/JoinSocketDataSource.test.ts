import { JoinSocketDataSource } from './JoinSocketDataSource';
import { createMockSocketGateways, type MockSocketGatewayBundle } from '../gateways/__mocks__/MockSocketGateways';
import type { DataContext } from '../../repositories/types';
import type { ChatReadInput } from '@lemoncloud/chatic-sockets-api';

describe('JoinSocketDataSource', () => {
    let mockGateways: MockSocketGatewayBundle;
    let dataSource: JoinSocketDataSource;
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'user-1' };

    beforeEach(() => {
        mockGateways = createMockSocketGateways();
        dataSource = new JoinSocketDataSource(mockGateways.join);
    });

    describe('outbound pipeline (Request)', () => {
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
    });

    describe('inbound mapping (View → Domain)', () => {
        it('maps the readChat response to a domain join and stamps cid from the context', async () => {
            (mockGateways.join.read as jest.Mock).mockResolvedValue({
                id: 'ch-1@user-1',
                channelId: 'ch-1',
                userId: 'user-1',
                readNo: 4,
            });

            const domain = await dataSource.readChat({ channelId: 'ch-1', chatNo: 4 }, context);

            expect(domain).toMatchObject({ id: 'ch-1@user-1', cid: 'cloud-a', channelId: 'ch-1', readNo: 4 });
        });
    });
});
