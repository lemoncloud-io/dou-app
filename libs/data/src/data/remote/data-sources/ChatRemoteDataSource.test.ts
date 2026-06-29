import { ChatRemoteDataSource } from './ChatRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { DataContext } from '../../repositories-v2/types';
import type { ChatFeedInput, ChatSendInput } from '@lemoncloud/chatic-sockets-api';

describe('ChatRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: ChatRemoteDataSource;
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new ChatRemoteDataSource(mockGateways.chat);
    });

    describe('발신(Send) 파이프라인 검증 (Request)', () => {
        it('sendChat 호출 시 chat.send 액션으로 request가 전송되어야 한다', async () => {
            const payload: ChatSendInput = { channelId: 'ch-1', content: 'hello', contentType: 'text' };
            await dataSource.sendChat(payload, context);
            expect(mockGateways.chat.send).toHaveBeenCalledWith(payload);
        });

        it('fetchChat 호출 시 chat.feed 액션으로 request가 전송되어야 한다', async () => {
            const payload: ChatFeedInput = { channelId: 'ch-1', limit: 20 };
            await dataSource.fetchChat(payload, context);
            expect(mockGateways.chat.feed).toHaveBeenCalledWith(payload);
        });

        it('getChat 호출 시 chat.get 액션으로 request가 전송되어야 한다', async () => {
            const payload = { id: 'm1' } as any;
            await dataSource.getChat(payload, context);
            expect(mockGateways.chat.get).toHaveBeenCalledWith(payload);
        });

        it('updateChat 호출 시 chat.update 액션으로 request가 전송되어야 한다', async () => {
            const payload = { id: 'm1', content: 'edited' } as any;
            await dataSource.updateChat(payload, context);
            expect(mockGateways.chat.update).toHaveBeenCalledWith(payload);
        });

        it('deleteChat 호출 시 chat.delete 액션으로 request가 전송되어야 한다', async () => {
            const payload = { id: 'm1' } as any;
            await dataSource.deleteChat(payload, context);
            expect(mockGateways.chat.delete).toHaveBeenCalledWith(payload);
        });
    });

    describe('수신(Receive) 매핑 검증 (View → Domain)', () => {
        it('sendChat 응답을 도메인 채팅으로 변환하고 전송상태 플래그를 보정한다', async () => {
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

        it('fetchChat 응답을 도메인 목록으로 변환하고 cursorNo/readNo 메타를 보존한다', async () => {
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
