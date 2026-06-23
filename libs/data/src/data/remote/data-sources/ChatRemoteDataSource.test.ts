import { ChatRemoteDataSource } from './ChatRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { ChatFeedInput, ChatSendInput } from '@lemoncloud/chatic-sockets-api';

describe('ChatRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: ChatRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new ChatRemoteDataSource(mockGateways.chat);
    });

    it('sendChat 호출 시 chat.send 액션으로 request가 전송되어야 한다', async () => {
        const payload: ChatSendInput = {
            channelId: 'ch-1',
            content: 'hello',
            contentType: 'text',
        };
        await dataSource.sendChat(payload);
        expect(mockGateways.chat.send).toHaveBeenCalledWith(payload);
    });

    it('fetchChat 호출 시 chat.feed 액션으로 request가 전송되어야 한다', async () => {
        const payload: ChatFeedInput = {
            channelId: 'ch-1',
            limit: 20,
        };
        await dataSource.fetchChat(payload);
        expect(mockGateways.chat.feed).toHaveBeenCalledWith(payload);
    });

    it('getChat 호출 시 chat.get 액션으로 request가 전송되어야 한다', async () => {
        const payload = { id: 'm1' } as any;
        await dataSource.getChat(payload);
        expect(mockGateways.chat.get).toHaveBeenCalledWith(payload);
    });

    it('updateChat 호출 시 chat.update 액션으로 request가 전송되어야 한다', async () => {
        const payload = { id: 'm1', content: 'edited' } as any;
        await dataSource.updateChat(payload);
        expect(mockGateways.chat.update).toHaveBeenCalledWith(payload);
    });

    it('deleteChat 호출 시 chat.delete 액션으로 request가 전송되어야 한다', async () => {
        const payload = { id: 'm1' } as any;
        await dataSource.deleteChat(payload);
        expect(mockGateways.chat.delete).toHaveBeenCalledWith(payload);
    });
});
