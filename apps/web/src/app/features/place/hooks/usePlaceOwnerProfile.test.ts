import { act, renderHook, waitFor } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { usePlaceOwnerProfile } from './usePlaceOwnerProfile';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
}));

const useRuntimeRepositoriesMock = useRuntimeRepositories as jest.Mock;

const unsubscribe = jest.fn();
const observeItem = jest.fn();
const cacheRead = jest.fn();
const refreshItem = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    observeItem.mockReturnValue(unsubscribe);
    cacheRead.mockResolvedValue(null);
    refreshItem.mockResolvedValue(null);
    useRuntimeRepositoriesMock.mockReturnValue({ profile: { observeItem, cacheRead, refreshItem } });
});

describe('usePlaceOwnerProfile — 플레이스 소유자 프로필 관측', () => {
    it('ownerId가 없으면 null을 반환하고 구독·조회하지 않는다', () => {
        // 기본플레이스(relay)는 stereo:'domain' 시스템 사이트로 소유자 필드가 없다.
        const { result } = renderHook(() => usePlaceOwnerProfile('0000', undefined));

        expect(result.current).toBeNull();
        expect(observeItem).not.toHaveBeenCalled();
        expect(cacheRead).not.toHaveBeenCalled();
        expect(refreshItem).not.toHaveBeenCalled();
    });

    it('placeId가 없으면 구독하지 않는다', () => {
        const { result } = renderHook(() => usePlaceOwnerProfile(undefined, 'u1'));

        expect(result.current).toBeNull();
        expect(observeItem).not.toHaveBeenCalled();
    });

    it('`${placeId}@${ownerId}`로 구독하고 콜백 값을 반환한다', () => {
        const { result } = renderHook(() => usePlaceOwnerProfile('p1', 'u1'));

        expect(observeItem).toHaveBeenCalledWith('p1@u1', expect.any(Function));

        const owner = { id: 'p1@u1', nick: '두유', thumbnail: 'data:img' };
        act(() => observeItem.mock.calls[0][1](owner));

        expect(result.current).toEqual(owner);
    });

    it('캐시에 이미 있으면 원격 조회하지 않는다', async () => {
        cacheRead.mockResolvedValue({ id: 'p1@u1', nick: '두유' });

        renderHook(() => usePlaceOwnerProfile('p1', 'u1'));

        await waitFor(() => expect(cacheRead).toHaveBeenCalledWith('p1@u1'));
        expect(refreshItem).not.toHaveBeenCalled();
    });

    it('캐시에 없으면 원격 조회로 보강한다', async () => {
        renderHook(() => usePlaceOwnerProfile('p1', 'u1'));

        await waitFor(() => expect(refreshItem).toHaveBeenCalledWith('p1@u1'));
    });

    it('조회가 실패해도 던지지 않고 null을 유지한다', async () => {
        refreshItem.mockRejectedValue(new Error('gone'));

        const { result } = renderHook(() => usePlaceOwnerProfile('p1', 'u1'));

        await waitFor(() => expect(refreshItem).toHaveBeenCalled());
        expect(result.current).toBeNull();
    });

    it('언마운트 시 구독을 해제한다', () => {
        const { unmount } = renderHook(() => usePlaceOwnerProfile('p1', 'u1'));
        unmount();

        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});
