import { chatHandler } from './chatHandler';
import { notifyAppUpdated } from '../sync-events';

jest.mock('../sync-events', () => ({ notifyAppUpdated: jest.fn() }));

describe('chatHandler', () => {
    const mockCloudId = 'test-cloud';
    const mockPlaceId = 'test-place';
    const mockMyUserId = 'user-me';

    let mockChatRepo: any;
    let mockChannelRepo: any;
    let mockJoinRepo: any;
    let mockUserRepo: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockChatRepo = { saveChat: jest.fn(), deleteChat: jest.fn() };
        mockChannelRepo = { getChannel: jest.fn(), saveChannel: jest.fn(), deleteChannel: jest.fn() };
        mockJoinRepo = { saveJoin: jest.fn() };
        mockUserRepo = { saveUsers: jest.fn() };
    });

    it('메시지를 저장하고 이벤트를 발생한다', async () => {
        const mockEnvelope = {
            action: 'send',
            payload: { id: 'msg1', content: 'hello' },
        } as any;

        mockChannelRepo.getChannel.mockResolvedValue({ id: 'ch1' });

        await chatHandler(
            mockEnvelope,
            mockCloudId,
            mockPlaceId,
            mockMyUserId,
            mockChatRepo,
            mockChannelRepo,
            mockJoinRepo,
            mockUserRepo
        );

        // 메시지 저장 확인
        expect(mockChatRepo.saveChat).toHaveBeenCalledWith('msg1', mockEnvelope.payload);

        // 채널 갱신 확인 (lastChat$ 병합 + unreadCount 계산)
        expect(mockChannelRepo.saveChannel).toHaveBeenCalledWith('ch1', {
            id: 'ch1',
            lastChat$: mockEnvelope.payload,
            unreadCount: 1,
        });

        expect(notifyAppUpdated).toHaveBeenCalledWith(expect.objectContaining({ domain: 'chat', action: 'send' }));
    });

    it('타인 메시지 수신 시 채널의 unreadCount 가 +1 된다', async () => {
        const mockEnvelope = {
            action: 'send',
            payload: { id: 'msg-other', ownerId: 'user-other', content: 'hi' },
            meta: { channel: 'ch1' },
        } as any;

        mockChannelRepo.getChannel.mockResolvedValue({ id: 'ch1', lastChat$: {}, unreadCount: 3 });

        await chatHandler(
            mockEnvelope,
            mockCloudId,
            mockPlaceId,
            mockMyUserId,
            mockChatRepo,
            mockChannelRepo,
            mockJoinRepo,
            mockUserRepo
        );

        expect(mockChannelRepo.saveChannel).toHaveBeenCalledWith('ch1', expect.objectContaining({ unreadCount: 4 }));
    });

    it('본인 메시지 송신 시 채널의 unreadCount 가 0 으로 초기화된다', async () => {
        const mockEnvelope = {
            action: 'send',
            payload: { id: 'msg-mine', ownerId: mockMyUserId, content: 'mine' },
            meta: { channel: 'ch1' },
        } as any;

        mockChannelRepo.getChannel.mockResolvedValue({ id: 'ch1', lastChat$: {}, unreadCount: 7 });

        await chatHandler(
            mockEnvelope,
            mockCloudId,
            mockPlaceId,
            mockMyUserId,
            mockChatRepo,
            mockChannelRepo,
            mockJoinRepo,
            mockUserRepo
        );

        expect(mockChannelRepo.saveChannel).toHaveBeenCalledWith('ch1', expect.objectContaining({ unreadCount: 0 }));
    });

    it('기존 unreadCount 가 없으면 타인 메시지에 대해 1 로 설정된다', async () => {
        const mockEnvelope = {
            action: 'send',
            payload: { id: 'msg1', ownerId: 'user-other', content: 'hello' },
            meta: { channel: 'ch1' },
        } as any;

        mockChannelRepo.getChannel.mockResolvedValue({ id: 'ch1', lastChat$: {} });

        await chatHandler(
            mockEnvelope,
            mockCloudId,
            mockPlaceId,
            mockMyUserId,
            mockChatRepo,
            mockChannelRepo,
            mockJoinRepo,
            mockUserRepo
        );

        expect(mockChannelRepo.saveChannel).toHaveBeenCalledWith('ch1', expect.objectContaining({ unreadCount: 1 }));
    });

    it('채널 캐시가 없으면 saveChannel 을 호출하지 않는다', async () => {
        const mockEnvelope = {
            action: 'send',
            payload: { id: 'msg1', ownerId: 'user-other', content: 'hello' },
            meta: { channel: 'ch-missing' },
        } as any;

        mockChannelRepo.getChannel.mockResolvedValue(undefined);

        await chatHandler(
            mockEnvelope,
            mockCloudId,
            mockPlaceId,
            mockMyUserId,
            mockChatRepo,
            mockChannelRepo,
            mockJoinRepo,
            mockUserRepo
        );

        expect(mockChatRepo.saveChat).toHaveBeenCalledWith('msg1', mockEnvelope.payload);
        expect(mockChannelRepo.saveChannel).not.toHaveBeenCalled();
        // chat/channel 이벤트는 그대로 방출
        expect(notifyAppUpdated).toHaveBeenCalledWith(expect.objectContaining({ domain: 'chat', action: 'send' }));
        expect(notifyAppUpdated).toHaveBeenCalledWith(expect.objectContaining({ domain: 'channel', action: 'send' }));
    });

    it('model:create 에서 온 payload 를 send 로 치환했을 때 lastChat$ 와 unreadCount 가 갱신된다', async () => {
        // useGlobalSocketRouter 의 case 'model' 분기가 만들어주는 형태
        const modelPayload = {
            id: '1000042:274',
            type: 'chat',
            chatNo: 274,
            content: '짯자짯자',
            channelId: '1000042',
            ownerId: 'user-other',
            memberNo: 4,
        };
        const reroutedEnvelope = {
            type: 'chat',
            action: 'send',
            payload: modelPayload,
            meta: { ts: 1776318610182, channel: '1000042' },
        } as any;

        mockChannelRepo.getChannel.mockResolvedValue({
            id: '1000042',
            lastChat$: { chatNo: 270 },
            unreadCount: 0,
        });

        await chatHandler(
            reroutedEnvelope,
            mockCloudId,
            mockPlaceId,
            mockMyUserId,
            mockChatRepo,
            mockChannelRepo,
            mockJoinRepo,
            mockUserRepo
        );

        expect(mockChatRepo.saveChat).toHaveBeenCalledWith('1000042:274', modelPayload);
        expect(mockChannelRepo.saveChannel).toHaveBeenCalledWith(
            '1000042',
            expect.objectContaining({
                lastChat$: expect.objectContaining({ chatNo: 274, content: '짯자짯자' }),
                unreadCount: 1,
            })
        );
        expect(notifyAppUpdated).toHaveBeenCalledWith(
            expect.objectContaining({ domain: 'chat', action: 'send', targetId: '1000042' })
        );
        expect(notifyAppUpdated).toHaveBeenCalledWith(
            expect.objectContaining({ domain: 'channel', action: 'send', targetId: '1000042' })
        );
    });

    it('내가 스스로 나간 경우 채널을 삭제한다', async () => {
        const mockEnvelope = {
            action: 'leave',
            payload: { userId: mockMyUserId },
            meta: { channel: 'ch1' },
        } as any;

        await chatHandler(
            mockEnvelope,
            mockCloudId,
            mockPlaceId,
            mockMyUserId,
            mockChatRepo,
            mockChannelRepo,
            mockJoinRepo,
            mockUserRepo
        );

        expect(mockChannelRepo.deleteChannel).toHaveBeenCalledWith('ch1');
        expect(notifyAppUpdated).toHaveBeenCalledWith(expect.objectContaining({ domain: 'channel', action: 'leave' }));
    });
});
