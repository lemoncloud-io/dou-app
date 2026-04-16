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

        // `chat` 도메인에 이벤트 방출
        expect(notifyAppUpdated).toHaveBeenCalledWith(expect.objectContaining({ domain: 'chat', action: 'send' }));
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
