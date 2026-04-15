import { renderHook, act, waitFor } from '@testing-library/react';
import { useChatMutations } from './useChatMutations';
import { useWebSocketV2 } from '@chatic/socket';
import { useDynamicProfile } from '@chatic/web-core';
import { useChatRepository } from '../repository';
import { APP_SYNC_EVENT_NAME } from '../sync-events';

jest.mock('@chatic/socket', () => ({ useWebSocketV2: jest.fn() }));
jest.mock('@chatic/web-core', () => ({ useDynamicProfile: jest.fn() }));
jest.mock('../repository', () => ({ useChatRepository: jest.fn() }));

describe('useChatMutations', () => {
    const mockEmitAuthenticated = jest.fn();
    const mockSaveChat = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (useWebSocketV2 as jest.Mock).mockReturnValue({
            emitAuthenticated: mockEmitAuthenticated,
            cloudId: 'test-cloud',
        });
        (useDynamicProfile as jest.Mock).mockReturnValue({ uid: 'user-1' });
        (useChatRepository as jest.Mock).mockReturnValue({ saveChat: mockSaveChat });
        mockSaveChat.mockResolvedValue(undefined);
    });

    it('sendMessage: 전송 시작 시 isPending.send가 true가 되고, 완료 이벤트 수신 시 false가 되며 resolve 된다', async () => {
        const { result } = renderHook(() => useChatMutations());

        let promiseResolved = false;

        act(() => {
            result.current.sendMessage({ channelId: 'ch1', content: 'hello' }).then(() => {
                promiseResolved = true;
            });
        });

        // 상태 변경 및 DB/소켓 호출 검증
        expect(result.current.isPending.send).toBe(true);

        await waitFor(() => {
            expect(mockSaveChat).toHaveBeenCalled();
            expect(mockEmitAuthenticated).toHaveBeenCalledWith(
                expect.objectContaining({ action: 'send', type: 'chat' })
            );
        });

        // 서버 응답(이벤트)
        act(() => {
            window.dispatchEvent(
                new CustomEvent(APP_SYNC_EVENT_NAME, {
                    detail: { domain: 'chat', action: 'send', targetId: 'ch1' },
                })
            );
        });

        // 완료 상태 검증
        await waitFor(() => {
            expect(result.current.isPending.send).toBe(false);
            expect(promiseResolved).toBe(true);
        });
    });

    it('readMessage: 읽음 처리 시작 시 isPending.read가 true가 되고, 완료 이벤트 수신 시 false가 되며 resolve 된다', async () => {
        const { result } = renderHook(() => useChatMutations());
        let promiseResolved = false;

        act(() => {
            result.current.readMessage({ channelId: 'ch1', chatNo: 100 }).then(() => {
                promiseResolved = true;
            });
        });

        expect(result.current.isPending.read).toBe(true);
        expect(mockEmitAuthenticated).toHaveBeenCalledWith(expect.objectContaining({ action: 'read', type: 'chat' }));

        act(() => {
            window.dispatchEvent(
                new CustomEvent(APP_SYNC_EVENT_NAME, {
                    detail: { domain: 'join', action: 'read', targetId: 'ch1' },
                })
            );
        });

        await waitFor(() => {
            expect(result.current.isPending.read).toBe(false);
            expect(promiseResolved).toBe(true);
        });
    });
});
