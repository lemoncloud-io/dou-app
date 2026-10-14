import { act, renderHook, waitFor } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { logger } from '@chatic/bridges';

import { useJoinMutations } from './useJoinMutations';

jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: jest.fn(),
        },
    },
}));

const updateJoin = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    updateJoin.mockResolvedValue({ delivered: Promise.resolve() });
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({ join: { updateJoin } });
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
        updateJoin.mockReturnValue(new Promise(r => (resolve = () => r({ delivered: Promise.resolve() }))));

        const { result } = renderHook(() => useJoinMutations());

        act(() => {
            void result.current.updateJoin({ channelId: 'c1', nick: 'x' } as never);
        });

        await waitFor(() => expect(result.current.isPending.update).toBe(true));
        act(() => resolve());
        await waitFor(() => expect(result.current.isPending.update).toBe(false));
    });

    it('hands the receipt back once the local write is done, and logs a later refusal', async () => {
        updateJoin.mockImplementation(async () => ({ delivered: Promise.reject(new Error('403 FORBIDDEN')) }));
        const { result } = renderHook(() => useJoinMutations());

        let receipt: { delivered: Promise<void> } | undefined;
        await act(async () => {
            receipt = await result.current.updateJoin({ channelId: 'c1', notify: 'none' } as never);
        });

        await expect(receipt?.delivered).rejects.toThrow('403');
        await waitFor(() =>
            expect(logger.error).toHaveBeenCalledWith('CHAT', 'join update refused', expect.anything())
        );
    });
});
