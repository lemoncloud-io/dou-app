import { renderHook } from '@testing-library/react';
import { useChatLocalDataSource } from './useChatLocalDataSource';
import { createStorageAdapter } from '../../data/local/storages';

jest.mock('../../data/local/storages', () => ({
    createStorageAdapter: jest.fn(),
}));

describe('useChatRepository', () => {
    const mockCloudId = 'test-cloud';
    const mockChatDB = { loadAll: jest.fn(), load: jest.fn(), save: jest.fn(), delete: jest.fn() };

    beforeEach(() => {
        jest.clearAllMocks();
        (createStorageAdapter as jest.Mock).mockReturnValue(mockChatDB);
    });

    it('getChats: 모든 채팅을 반환한다', async () => {
        mockChatDB.loadAll.mockResolvedValue([{ id: 'msg1' }]);
        const { result } = renderHook(() => useChatLocalDataSource(mockCloudId));
        const chats = await result.current.getChats();
        expect(chats).toHaveLength(1);
    });

    it('getChatsByChannel: 특정 채널의 채팅만 필터링한다', async () => {
        mockChatDB.loadAll.mockResolvedValue([
            { id: 'msg1', channelId: 'ch1' },
            { id: 'msg2', channelId: 'ch2' },
            { id: 'msg3', channelId: 'ch1' },
        ]);
        const { result } = renderHook(() => useChatLocalDataSource(mockCloudId));
        const chats = await result.current.getChatsByChannel('ch1');

        expect(chats).toHaveLength(2);
        expect(chats.map(c => c.id)).toEqual(['msg1', 'msg3']);
    });

    it('saveChat & deleteChat이 정상 호출된다', async () => {
        const { result } = renderHook(() => useChatLocalDataSource(mockCloudId));
        const mockData = { id: 'msg1', content: 'hello' } as any;

        await result.current.saveChat('msg1', mockData);
        expect(mockChatDB.save).toHaveBeenCalledWith('msg1', mockData);

        await result.current.deleteChat('msg1');
        expect(mockChatDB.delete).toHaveBeenCalledWith('msg1');
    });
});
