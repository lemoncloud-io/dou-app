import { act, renderHook, waitFor } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useJoinMutations } from './useJoinMutations';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
}));

const updateJoin = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    updateJoin.mockResolvedValue({ id: 'j1', nick: 'My room' });
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ join: { updateJoin } });
});

describe('useJoinMutations — join.update 래핑', () => {
    it('updateJoin이 repository로 payload를 그대로 위임한다', async () => {
        const { result } = renderHook(() => useJoinMutations());

        await act(async () => {
            await result.current.updateJoin({ channelId: 'c1', nick: 'My room' } as never);
        });

        expect(updateJoin).toHaveBeenCalledWith({ channelId: 'c1', nick: 'My room' });
    });

    it('진행 중 pending.update가 true였다가 완료 후 false로 돌아온다', async () => {
        let resolve!: () => void;
        updateJoin.mockReturnValue(new Promise<void>(r => (resolve = r)));

        const { result } = renderHook(() => useJoinMutations());

        act(() => {
            void result.current.updateJoin({ channelId: 'c1', nick: 'x' } as never);
        });

        await waitFor(() => expect(result.current.isPending.update).toBe(true));
        act(() => resolve());
        await waitFor(() => expect(result.current.isPending.update).toBe(false));
    });
});
