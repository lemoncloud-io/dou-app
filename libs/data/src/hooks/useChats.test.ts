import { renderHook, act } from '@testing-library/react';
import { useWebSocketV2 } from '@chatic/socket';
import { useChats } from '../hooks';
import { APP_SYNC_EVENT_NAME } from '../sync-events';

jest.mock('@chatic/socket', () => ({
    useWebSocketV2: jest.fn(),
}));

jest.mock('@chatic/web-core', () => ({
    useDynamicProfile: jest.fn(() => ({ uid: 'test-user' })),
    cloudCore: {
        getConfig: jest.fn(),
    },
}));

describe('useChats', () => {
    const mockEmitAuthenticated = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();

        (useWebSocketV2 as jest.Mock).mockReturnValue({
            emitAuthenticated: mockEmitAuthenticated,
            cloudId: 'test-cloud',
        });
    });

    it('마운트 시 chat:feed 요청을 서버로 전송한다', () => {
        renderHook(() => useChats({ channelId: 'ch1' }));

        expect(mockEmitAuthenticated).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'feed', type: 'chat', payload: { channelId: 'ch1' } })
        );
    });

    it('feed 이벤트 수신 시 messages에 누적하고 cursorNo를 저장한다', () => {
        const { result } = renderHook(() => useChats({ channelId: 'ch1' }));

        expect(result.current.isLoading).toBe(true);

        // feed 이벤트 시뮬레이션
        act(() => {
            window.dispatchEvent(
                new CustomEvent(APP_SYNC_EVENT_NAME, {
                    detail: {
                        domain: 'chat',
                        action: 'feed',
                        cid: 'test-cloud',
                        targetId: 'ch1',
                        payload: {
                            list: [
                                { id: 'm1', chatNo: 10, content: 'hello', createdAt: '2024-01-01T00:00:00Z' },
                                { id: 'm2', chatNo: 20, content: 'world', createdAt: '2024-01-01T00:01:00Z' },
                            ],
                            cursorNo: 5,
                        },
                    },
                })
            );
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[0].id).toBe('m1');
        expect(result.current.messages[1].id).toBe('m2');
        expect(result.current.hasMore).toBe(true);
    });

    it('cursorNo=0이면 hasMore가 false가 된다', () => {
        const { result } = renderHook(() => useChats({ channelId: 'ch1' }));

        act(() => {
            window.dispatchEvent(
                new CustomEvent(APP_SYNC_EVENT_NAME, {
                    detail: {
                        domain: 'chat',
                        action: 'feed',
                        cid: 'test-cloud',
                        targetId: 'ch1',
                        payload: { list: [], cursorNo: 0 },
                    },
                })
            );
        });

        expect(result.current.hasMore).toBe(false);
    });

    it('send 이벤트 수신 시 메시지를 뒤에 append한다', () => {
        const { result } = renderHook(() => useChats({ channelId: 'ch1' }));

        // 먼저 feed로 기존 메시지 로드
        act(() => {
            window.dispatchEvent(
                new CustomEvent(APP_SYNC_EVENT_NAME, {
                    detail: {
                        domain: 'chat',
                        action: 'feed',
                        cid: 'test-cloud',
                        targetId: 'ch1',
                        payload: {
                            list: [{ id: 'm1', chatNo: 10, content: 'first', createdAt: '2024-01-01T00:00:00Z' }],
                            cursorNo: 5,
                        },
                    },
                })
            );
        });

        // send 이벤트
        act(() => {
            window.dispatchEvent(
                new CustomEvent(APP_SYNC_EVENT_NAME, {
                    detail: {
                        domain: 'chat',
                        action: 'send',
                        cid: 'test-cloud',
                        targetId: 'ch1',
                        payload: { id: 'm2', chatNo: 11, content: 'new msg', createdAt: '2024-01-01T00:02:00Z' },
                    },
                })
            );
        });

        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[1].id).toBe('m2');
    });

    it('loadMore 호출 시 feedCursorNo로 feed 요청을 보낸다', () => {
        const { result } = renderHook(() => useChats({ channelId: 'ch1' }));

        // cursorNo 설정
        act(() => {
            window.dispatchEvent(
                new CustomEvent(APP_SYNC_EVENT_NAME, {
                    detail: {
                        domain: 'chat',
                        action: 'feed',
                        cid: 'test-cloud',
                        targetId: 'ch1',
                        payload: {
                            list: [{ id: 'm1', chatNo: 50, content: 'msg', createdAt: '2024-01-01T00:00:00Z' }],
                            cursorNo: 30,
                        },
                    },
                })
            );
        });

        mockEmitAuthenticated.mockClear();

        act(() => {
            result.current.loadMore();
        });

        expect(result.current.isLoadingMore).toBe(true);
        expect(mockEmitAuthenticated).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'feed',
                type: 'chat',
                payload: { channelId: 'ch1', cursorNo: 30 },
            })
        );
    });
});
