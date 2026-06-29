import { renderHook } from '@testing-library/react';

import { getSyncManager, useSocketState } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';

import { useMyJoinsSync } from './useMyJoinsSync';

jest.mock('@chatic/app-runtime', () => ({ getSyncManager: jest.fn(), useSocketState: jest.fn() }));
jest.mock('@chatic/web-core', () => ({ useSessionIdentity: jest.fn() }));

const registerJoin = jest.fn();
const dispose = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    registerJoin.mockReturnValue(dispose);
    (getSyncManager as jest.Mock).mockReturnValue({ registerJoin });
    (useSocketState as jest.Mock).mockReturnValue({ isVerified: true });
    (useSessionIdentity as jest.Mock).mockReturnValue({ userId: 'me' });
});

describe('useMyJoinsSync — 내 join sync 등록', () => {
    it('채널마다 내 join(`${channelId}@${uid}`)을 등록한다', () => {
        renderHook(() => useMyJoinsSync(['c1', 'c2']));

        expect(registerJoin).toHaveBeenCalledTimes(2);
        expect(registerJoin).toHaveBeenCalledWith('c1@me');
        expect(registerJoin).toHaveBeenCalledWith('c2@me');
    });

    it('isVerified 전에는 등록하지 않는다', () => {
        (useSocketState as jest.Mock).mockReturnValue({ isVerified: false });

        renderHook(() => useMyJoinsSync(['c1']));

        expect(registerJoin).not.toHaveBeenCalled();
    });

    it('uid가 없으면 등록하지 않는다', () => {
        (useSessionIdentity as jest.Mock).mockReturnValue({ userId: undefined });

        renderHook(() => useMyJoinsSync(['c1']));

        expect(registerJoin).not.toHaveBeenCalled();
    });

    it('언마운트 시 모든 등록을 해제한다', () => {
        const { unmount } = renderHook(() => useMyJoinsSync(['c1', 'c2']));

        unmount();

        expect(dispose).toHaveBeenCalledTimes(2);
    });

    it('채널 목록이 바뀌면 이전 등록을 해제하고 재등록한다', () => {
        const { rerender } = renderHook(({ ids }: { ids: string[] }) => useMyJoinsSync(ids), {
            initialProps: { ids: ['c1'] },
        });
        expect(registerJoin).toHaveBeenCalledTimes(1);

        rerender({ ids: ['c1', 'c2'] });

        expect(dispose).toHaveBeenCalledTimes(1); // 이전 set 해제
        expect(registerJoin).toHaveBeenCalledTimes(3); // 1 + 2
    });
});
