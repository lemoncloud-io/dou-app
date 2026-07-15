import { act, renderHook, waitFor } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DomainProfile } from '@chatic/data';
import { useSessionIdentity, useSessionSelection } from '@chatic/web-core';

import { usePlaceProfilePrompt } from './usePlaceProfilePrompt';
import { usePreferenceStore } from '../../../stores/usePreferenceStore';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));
jest.mock('@chatic/web-core', () => ({ useSessionSelection: jest.fn(), useSessionIdentity: jest.fn() }));
jest.mock('../../../stores/usePreferenceStore', () => ({ usePreferenceStore: jest.fn() }));

const observeItemMock = jest.fn();
const getMyProfileMock = jest.fn();
const disposeMock = jest.fn();
const skipPlaceProfileMock = jest.fn();
let observeCb: ((p: DomainProfile | null) => void) | null = null;

const profile = (nick?: string): DomainProfile => ({ nick }) as unknown as DomainProfile;

const setSession = (sid: string | null, uid: string | null = 'u1') => {
    (useSessionSelection as jest.Mock).mockReturnValue({ selectedSiteId: sid });
    (useSessionIdentity as jest.Mock).mockReturnValue({ userId: uid });
};

const setSkipped = (ids: string[]) => {
    (usePreferenceStore as unknown as jest.Mock).mockImplementation((selector: (s: unknown) => unknown) =>
        selector({ skippedPlaceProfileIds: ids, skipPlaceProfile: skipPlaceProfileMock })
    );
};

// Flush the getMyProfile then→catch→finally chain (+ setState) within act().
const flush = () =>
    act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });

beforeEach(() => {
    jest.clearAllMocks();
    observeCb = null;
    observeItemMock.mockImplementation((_id, cb) => {
        observeCb = cb;
        return disposeMock;
    });
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
        profile: { observeItem: observeItemMock, getMyProfile: getMyProfileMock },
    });
    setSession('SITE#1');
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

    it('nick이 채워져 있으면 표시하지 않는다', async () => {
        // A real read writes the cache, which fans in through observeItem — mirror that.
        getMyProfileMock.mockImplementation(async () => {
            observeCb?.(profile('sunny'));
            return profile('sunny');
        });

        const { result } = renderHook(() => usePlaceProfilePrompt());
        await flush();

        expect(result.current.shouldPrompt).toBe(false);
    });

    it('프로필 저장 후 뒤늦게 빈 프로필이 와도 다시 표시하지 않는다 (present 래치)', async () => {
        // Reproduces the concurrency bug: getMyProfile would settle empty (absent)...
        getMyProfileMock.mockResolvedValue(profile(''));

        const { result } = renderHook(() => usePlaceProfilePrompt());

        // ...but the user's save emits a real profile → present (latched).
        act(() => observeCb?.(profile('sunny')));
        expect(result.current.shouldPrompt).toBe(false);

        // A late/stale empty cache emit must NOT downgrade back to absent.
        act(() => observeCb?.(profile('')));
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

    it('getMyProfile가 실패하면 로딩으로 간주해 표시하지 않는다 (부팅 중 소켓 연결 대기)', async () => {
        // A rejected read on boot (socket still connecting / 503) is transient, NOT "no profile".
        // Must stay unknown so the prompt does not flash while the profile is still loading.
        getMyProfileMock.mockRejectedValue(new Error('503 socket'));

        const { result } = renderHook(() => usePlaceProfilePrompt());
        await flush();

        expect(result.current.shouldPrompt).toBe(false);
    });

    it('reject 후 재시도가 resolve되면 그때 판정한다', async () => {
        jest.useFakeTimers();
        try {
            // First read rejects (connecting), retry resolves empty → absent → 표시.
            getMyProfileMock.mockRejectedValueOnce(new Error('503 socket')).mockResolvedValueOnce(profile(''));

            const { result } = renderHook(() => usePlaceProfilePrompt());
            await act(async () => {
                await Promise.resolve(); // let the first rejection settle + schedule retry
            });
            expect(result.current.shouldPrompt).toBe(false); // still unknown (retry pending)

            await act(async () => {
                jest.advanceTimersByTime(800); // fire the retry
                await Promise.resolve();
                await Promise.resolve();
            });
            expect(result.current.shouldPrompt).toBe(true);
        } finally {
            jest.useRealTimers();
        }
    });

    it('reject 중에도 캐시에 nick이 있으면 표시하지 않는다', async () => {
        getMyProfileMock.mockRejectedValue(new Error('network'));

        const { result } = renderHook(() => usePlaceProfilePrompt());
        // Cache already holds a real profile (e.g. from an earlier sync).
        act(() => observeCb?.(profile('sunny')));
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

    it('표시 이후 sync로 nick이 도착하면 표시를 닫는다', async () => {
        getMyProfileMock.mockResolvedValue(profile(''));

        const { result } = renderHook(() => usePlaceProfilePrompt());
        await waitFor(() => expect(result.current.shouldPrompt).toBe(true));

        act(() => observeCb?.(profile('late-arrival')));

        expect(result.current.shouldPrompt).toBe(false);
    });

    it('dismiss는 활성 sid로 skipPlaceProfile을 호출한다', async () => {
        getMyProfileMock.mockResolvedValue(profile(''));

        const { result } = renderHook(() => usePlaceProfilePrompt());
        await waitFor(() => expect(result.current.shouldPrompt).toBe(true));

        act(() => result.current.dismiss());

        expect(skipPlaceProfileMock).toHaveBeenCalledWith('SITE#1');
    });
});
