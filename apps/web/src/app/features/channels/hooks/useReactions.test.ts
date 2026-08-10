import { act, renderHook, waitFor } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useReactions } from './useReactions';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));

const setReaction = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    setReaction.mockResolvedValue({});
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ chat: { setReaction } });
});

describe('useReactions — 리액션 토글', () => {
    it('내 리액션이 아니면 on을 보낸다', () => {
        const { result } = renderHook(() => useReactions());
        act(() => result.current.toggleReaction('C1:1', '👍', false));
        expect(setReaction).toHaveBeenCalledWith({ chatId: 'C1:1', emoji: '👍', action: 'on' });
    });

    // The server does not toggle — the client reads `mine` off the folded tally and
    // sends the opposite as a target state.
    it('이미 내 리액션이면 off를 보낸다', () => {
        const { result } = renderHook(() => useReactions());
        act(() => result.current.toggleReaction('C1:1', '👍', true));
        expect(setReaction).toHaveBeenCalledWith({ chatId: 'C1:1', emoji: '👍', action: 'off' });
    });

    it('실패하면 어느 메시지가 실패했는지 failedId로 남긴다', async () => {
        setReaction.mockRejectedValue(new Error('nope'));
        const { result } = renderHook(() => useReactions());

        act(() => result.current.toggleReaction('C1:1', '👍', false));

        await waitFor(() => expect(result.current.failedId).toBe('C1:1'));
    });

    it('다음 토글이 시작되면 failedId를 지운다', async () => {
        setReaction.mockRejectedValueOnce(new Error('nope')).mockResolvedValueOnce({});
        const { result } = renderHook(() => useReactions());

        act(() => result.current.toggleReaction('C1:1', '👍', false));
        await waitFor(() => expect(result.current.failedId).toBe('C1:1'));

        act(() => result.current.toggleReaction('C1:1', '👍', false));
        expect(result.current.failedId).toBeNull();
    });
});
