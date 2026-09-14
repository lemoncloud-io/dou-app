import { ChatSocketDataSource } from './ChatSocketDataSource';
import { createMockSocketGateways, type MockSocketGatewayBundle } from '../gateways/__mocks__/MockSocketGateways';
import type { DataContext } from '../../repositories/types';
import type { ChatFeedInput, ChatSendInput } from '@lemoncloud/chatic-sockets-api';

describe('ChatSocketDataSource', () => {
    let mockGateways: MockSocketGatewayBundle;
    let dataSource: ChatSocketDataSource;
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };

    beforeEach(() => {
        mockGateways = createMockSocketGateways();
        dataSource = new ChatSocketDataSource(mockGateways.chat);
    });

    describe('outbound pipeline (Request)', () => {
        it('sendChat sends the request as the chat.send action', async () => {
            const payload: ChatSendInput = { channelId: 'ch-1', content: 'hello', contentType: 'text' };
            await dataSource.sendChat(payload, context);
            expect(mockGateways.chat.send).toHaveBeenCalledWith(payload);
        });

        it('fetchChat sends the request as the chat.feed action', async () => {
            const payload: ChatFeedInput = { channelId: 'ch-1', limit: 20 };
            await dataSource.fetchChat(payload, context);
            expect(mockGateways.chat.feed).toHaveBeenCalledWith(payload);
        });

        it('getChat sends the request as the chat.get action', async () => {
            const payload = { id: 'm1' } as any;
            await dataSource.getChat(payload, context);
            expect(mockGateways.chat.get).toHaveBeenCalledWith(payload);
        });

        it('updateChat sends the request as the chat.update action', async () => {
            const payload = { id: 'm1', content: 'edited' } as any;
            await dataSource.updateChat(payload, context);
            expect(mockGateways.chat.update).toHaveBeenCalledWith(payload);
        });

        it('deleteChat sends the request as the chat.delete action', async () => {
            const payload = { id: 'm1' } as any;
            await dataSource.deleteChat(payload, context);
            expect(mockGateways.chat.delete).toHaveBeenCalledWith(payload);
        });
    });

    describe('inbound mapping (View → Domain)', () => {
        it('maps the sendChat response to a domain chat and normalizes the send-state flags', async () => {
            (mockGateways.chat.send as jest.Mock).mockResolvedValue({
                id: 'm1',
                channelId: 'ch-1',
                createdAt: 1000,
            });

            const domain = await dataSource.sendChat({ channelId: 'ch-1' } as any, context);

            expect(domain).toMatchObject({ id: 'm1', cid: 'cloud-a', channelId: 'ch-1' });
            expect(domain.isPending).toBe(false);
            expect(domain.isFailed).toBe(false);
            expect(domain.createdAtMs).toBe(1000);
        });

        it('maps the fetchChat response to a domain list and preserves the cursorNo/readNo metadata', async () => {
            (mockGateways.chat.feed as jest.Mock).mockResolvedValue({
                list: [{ id: 'm1', channelId: 'ch-1' }],
                cursorNo: 7,
                readNo: 3,
                total: 1,
            });

            const result = await dataSource.fetchChat({ channelId: 'ch-1' } as any, context);

            expect(result.list[0]).toMatchObject({ id: 'm1', cid: 'cloud-a', channelId: 'ch-1' });
            expect(result.cursorNo).toBe(7);
            expect(result.readNo).toBe(3);
        });
    });
});
