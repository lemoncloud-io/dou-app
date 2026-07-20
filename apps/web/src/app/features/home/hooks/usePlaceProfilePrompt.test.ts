import { act, renderHook, waitFor } from '@testing-library/react';

import { useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainProfile } from '@chatic/data';
import { useSessionIdentity, useSessionSelection } from '@chatic/web-core';

import { usePlaceProfilePrompt } from './usePlaceProfilePrompt';
import { usePreferenceStore } from '../../../stores/usePreferenceStore';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn(), useRuntimeSocketState: jest.fn() }));
jest.mock('@chatic/web-core', () => ({
    useSessionSelection: jest.fn(),
    useSessionIdentity: jest.fn(),
    SWITCH_SITE_MUTATION_KEY: ['switch-site'],
    SWITCH_CLOUD_MUTATION_KEY: ['switch-cloud'],
}));
jest.mock('../../../stores/usePreferenceStore', () => ({ usePreferenceStore: jest.fn() }));
// isSwitching is derived from useIsMutating over the switch keys; mock returns the current count.
let mutatingCount = 0;
jest.mock('@tanstack/react-query', () => ({ useIsMutating: jest.fn(() => mutatingCount) }));

const getMyProfileMock = jest.fn();
const skipPlaceProfileMock = jest.fn();

const profile = (nick?: string): DomainProfile => ({ nick }) as unknown as DomainProfile;

const setSession = (sid: string | null, uid: string | null = 'u1') => {
    (useSessionSelection as jest.Mock).mockReturnValue({ selectedSiteId: sid });
    (useSessionIdentity as jest.Mock).mockReturnValue({ userId: uid });
};

// settled = isVerified && !isSwitching. Defaults below make the switch look fully committed.
const setVerified = (isVerified: boolean) => {
    (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified });
};
const setSwitching = (switching: boolean) => {
    mutatingCount = switching ? 1 : 0;
};

const setSkipped = (ids: string[]) => {
    (usePreferenceStore as unknown as jest.Mock).mockImplementation((selector: (s: unknown) => unknown) =>
        selector({ skippedPlaceProfileIds: ids, skipPlaceProfile: skipPlaceProfileMock })
    );
};

// Flush the getMyProfile then→catch chain (+ setState) within act().
const flush = () =>
    act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });

beforeEach(() => {
    jest.clearAllMocks();
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
        profile: { getMyProfile: getMyProfileMock },
    });
    setSession('SITE#1');
    setVerified(true); // committed by default
    setSwitching(false);
    setSkipped([]);
});

describe('usePlaceProfilePrompt — 플레이스 프로필 생성 감지', () => {
    it('로딩 중(getMyProfile 미resolve)에는 표시하지 않는다', () => {
        getMyProfileMock.mockReturnValue(new Promise(() => undefined)); // never resolves

        const { result } = renderHook(() => usePlaceProfilePrompt());

        expect(result.current.shouldPrompt).toBe(false);
    });

    it('resolve 후 nick이 비어 있고 미건너뛰기면 표시한다', async () => {
        getMyProfileMock.mockResolvedValue(profile(''));

        const { result } = renderHook(() => usePlaceProfilePrompt());

        await waitFor(() => expect(result.current.shouldPrompt).toBe(true));
    });

    it('getMyProfile의 nick이 채워져 있으면 표시하지 않는다', async () => {
        getMyProfileMock.mockResolvedValue(profile('sunny'));

        const { result } = renderHook(() => usePlaceProfilePrompt());
        await flush();

        expect(result.current.shouldPrompt).toBe(false);
    });

    it('건너뛴 플레이스면 표시하지 않는다', async () => {
        setSkipped(['SITE#1']);
        getMyProfileMock.mockResolvedValue(profile(''));

        const { result } = renderHook(() => usePlaceProfilePrompt());
        await flush();

        expect(result.current.shouldPrompt).toBe(false);
    });

    it('sid/uid가 없으면 조회하지 않고 표시하지 않는다', async () => {
        setSession(null);

        const { result } = renderHook(() => usePlaceProfilePrompt());
        await flush();

        expect(getMyProfileMock).not.toHaveBeenCalled();
        expect(result.current.shouldPrompt).toBe(false);
    });

    it('소켓 미검증(부팅 중)에는 조회하지 않고 표시하지 않는다', async () => {
        setVerified(false); // not committed yet
        getMyProfileMock.mockResolvedValue(profile(''));

        const { result } = renderHook(() => usePlaceProfilePrompt());
        await flush();

        expect(getMyProfileMock).not.toHaveBeenCalled();
        expect(result.current.shouldPrompt).toBe(false);
    });

    it('사이트 전환 진행 중에는 조회하지 않는다 (전환 커밋 전)', async () => {
        setSwitching(true); // switch in flight → not settled
        getMyProfileMock.mockResolvedValue(profile(''));

        const { result } = renderHook(() => usePlaceProfilePrompt());
        await flush();

        expect(getMyProfileMock).not.toHaveBeenCalled();
        expect(result.current.shouldPrompt).toBe(false);
    });

    it('전환이 완료(settled)되는 순간에만 검증을 수행한다', async () => {
        // Start mid-switch: no read yet.
        setSwitching(true);
        getMyProfileMock.mockResolvedValue(profile(''));

        const { result, rerender } = renderHook(() => usePlaceProfilePrompt());
        await flush();
        expect(getMyProfileMock).not.toHaveBeenCalled();

        // Switch settles → the read fires against the now-committed context.
        setSwitching(false);
        rerender();
        await waitFor(() => expect(result.current.shouldPrompt).toBe(true));
        expect(getMyProfileMock).toHaveBeenCalledTimes(1);
    });

    it('getMyProfile가 실패하면 표시하지 않는다', async () => {
        getMyProfileMock.mockRejectedValue(new Error('network'));

        const { result } = renderHook(() => usePlaceProfilePrompt());
        await flush();

        expect(result.current.shouldPrompt).toBe(false);
    });

    it('default cloud(relay)에서도 sid/uid만 있으면 동작한다', async () => {
        // No cloud gating — a relay-sourced siteId is treated the same as a cloud one.
        setSession('RELAY_SITE#9', 'guest-1');
        getMyProfileMock.mockResolvedValue(profile(''));

        const { result } = renderHook(() => usePlaceProfilePrompt());

        await waitFor(() => expect(result.current.shouldPrompt).toBe(true));
    });

    it('dismiss는 활성 sid로 skipPlaceProfile을 호출한다', async () => {
        getMyProfileMock.mockResolvedValue(profile(''));

        const { result } = renderHook(() => usePlaceProfilePrompt());
        await waitFor(() => expect(result.current.shouldPrompt).toBe(true));

        act(() => result.current.dismiss());

        expect(skipPlaceProfileMock).toHaveBeenCalledWith('SITE#1');
    });
});
