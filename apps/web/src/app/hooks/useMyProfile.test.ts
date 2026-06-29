import { act, renderHook, waitFor } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity, useSessionSelection } from '@chatic/web-core';

import { useMyProfile } from './useMyProfile';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
}));

jest.mock('@chatic/web-core', () => ({
    useSessionSelection: jest.fn(),
    useSessionIdentity: jest.fn(),
}));

const useRuntimeRepositoriesMock = useRuntimeRepositories as jest.Mock;
const useSessionSelectionMock = useSessionSelection as jest.Mock;
const useSessionIdentityMock = useSessionIdentity as jest.Mock;

const unsubscribe = jest.fn();
const observeItem = jest.fn();
const getMyProfile = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    observeItem.mockReturnValue(unsubscribe);
    getMyProfile.mockResolvedValue(null);
    useRuntimeRepositoriesMock.mockReturnValue({ profile: { observeItem, getMyProfile } });
});

describe('useMyProfile — 활성 사이트 내 프로필 관측', () => {
    it('sid 또는 uid가 없으면 null을 반환하고 구독/조회하지 않는다', () => {
        useSessionSelectionMock.mockReturnValue({ selectedSiteId: null });
        useSessionIdentityMock.mockReturnValue({ userId: 'u1' });

        const { result } = renderHook(() => useMyProfile());

        expect(result.current.profile).toBeNull();
        expect(observeItem).not.toHaveBeenCalled();
        expect(getMyProfile).not.toHaveBeenCalled();
    });

    it('sid/uid가 있으면 `${sid}@${uid}`로 구독하고 1회 fetch하며, 콜백 값을 반환한다', async () => {
        useSessionSelectionMock.mockReturnValue({ selectedSiteId: 's1' });
        useSessionIdentityMock.mockReturnValue({ userId: 'u1' });

        const { result } = renderHook(() => useMyProfile());

        expect(observeItem).toHaveBeenCalledWith('s1@u1', expect.any(Function));
        await waitFor(() => expect(getMyProfile).toHaveBeenCalledTimes(1));

        const profile = { id: 's1@u1', nick: '홍길동', thumbnail: 'data:img' };
        act(() => observeItem.mock.calls[0][1](profile));

        expect(result.current.profile).toEqual(profile);
    });

    it('언마운트 시 구독을 해제한다', () => {
        useSessionSelectionMock.mockReturnValue({ selectedSiteId: 's1' });
        useSessionIdentityMock.mockReturnValue({ userId: 'u1' });

        const { unmount } = renderHook(() => useMyProfile());
        unmount();

        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});
