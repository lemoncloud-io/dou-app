import { act, renderHook, waitFor } from '@testing-library/react';

import { useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainProfile } from '@chatic/data';
import { useSessionIdentity, useSessionSelection } from '@chatic/web-core';

import { usePlaceProfilePrompt } from './usePlaceProfilePrompt';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn(), useRuntimeSocketState: jest.fn() }));
jest.mock('@chatic/web-core', () => ({
    useSessionSelection: jest.fn(),
    useSessionIdentity: jest.fn(),
    SWITCH_SITE_MUTATION_KEY: ['switch-site'],
    SWITCH_CLOUD_MUTATION_KEY: ['switch-cloud'],
}));
// isSwitching is derived from useIsMutating over the switch keys; mock returns the current count.
let mutatingCount = 0;
jest.mock('@tanstack/react-query', () => ({ useIsMutating: jest.fn(() => mutatingCount) }));

const getMyProfileMock = jest.fn();

// Server contract: present ⇒ nick + active:true, absent ⇒ no nick + active:false. Every response
// also carries the site it is for (`sid`); the hook trusts a verdict only when that sid matches the
// one it asked about (default 'SITE#1'), so builders default to the requested site.
const present = (sid = 'SITE#1', nick = 'sunny'): DomainProfile =>
    ({ sid, nick, active: true }) as unknown as DomainProfile;
const absent = (sid = 'SITE#1'): DomainProfile => ({ sid, active: false }) as unknown as DomainProfile;

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
});

describe('usePlaceProfilePrompt — 플레이스 프로필 생성 감지', () => {
    it('로딩 중(getMyProfile 미resolve)에는 표시하지 않는다', () => {
        getMyProfileMock.mockReturnValue(new Promise(() => undefined)); // never resolves

        const { result } = renderHook(() => usePlaceProfilePrompt());

        expect(result.current.shouldPrompt).toBe(false);
    });

    it('nick 없음 + active:false면 표시하고 status=absent (스킵 경로 없음 — 필수)', async () => {
        getMyProfileMock.mockResolvedValue(absent());

        const { result } = renderHook(() => usePlaceProfilePrompt());

        await waitFor(() => expect(result.current.shouldPrompt).toBe(true));
        expect(result.current.status).toBe('absent');
    });

    it('nick 있음 + active:true면 표시하지 않고 status=present', async () => {
        getMyProfileMock.mockResolvedValue(present());

        const { result } = renderHook(() => usePlaceProfilePrompt());
        await flush();

        expect(result.current.shouldPrompt).toBe(false);
        expect(result.current.status).toBe('present');
    });

    it('응답 sid가 요청 sid와 다르면 판정하지 않고 unknown 유지 (전이/stale 컨텍스트 오판 차단)', async () => {
        // Read fired against the committed context, but the response is for another site — a
        // transitional/stale read. Must NOT be read as absent (would prompt over an existing profile).
        getMyProfileMock.mockResolvedValue(absent('OTHER_SITE#2'));

        const { result } = renderHook(() => usePlaceProfilePrompt());
        await flush();

        expect(result.current.status).toBe('unknown');
        expect(result.current.shouldPrompt).toBe(false);
    });

    it('nick 없지만 active:true인 애매한 응답은 unknown (false absent 방지)', async () => {
        getMyProfileMock.mockResolvedValue({ sid: 'SITE#1', active: true } as unknown as DomainProfile);

        const { result } = renderHook(() => usePlaceProfilePrompt());
        await flush();

        expect(result.current.status).toBe('unknown');
        expect(result.current.shouldPrompt).toBe(false);
    });

    it('nick이 있으면 active 값과 무관하게 present (nick이 곧 "프로필 있음" — 초대 네비게이션 hang 방지)', async () => {
        getMyProfileMock.mockResolvedValue({ sid: 'SITE#1', nick: 'x', active: false } as unknown as DomainProfile);

        const { result } = renderHook(() => usePlaceProfilePrompt());
        await flush();

        expect(result.current.status).toBe('present');
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
        getMyProfileMock.mockResolvedValue(absent());

        const { result } = renderHook(() => usePlaceProfilePrompt());
        await flush();

        expect(getMyProfileMock).not.toHaveBeenCalled();
        expect(result.current.shouldPrompt).toBe(false);
    });

    it('사이트 전환 진행 중에는 조회하지 않는다 (전환 커밋 전)', async () => {
        setSwitching(true); // switch in flight → not settled
        getMyProfileMock.mockResolvedValue(absent());

        const { result } = renderHook(() => usePlaceProfilePrompt());
        await flush();

        expect(getMyProfileMock).not.toHaveBeenCalled();
        expect(result.current.shouldPrompt).toBe(false);
    });

    it('전환이 완료(settled)되는 순간에만 검증을 수행한다', async () => {
        // Start mid-switch: no read yet.
        setSwitching(true);
        getMyProfileMock.mockResolvedValue(absent());

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
        getMyProfileMock.mockResolvedValue(absent('RELAY_SITE#9'));

        const { result } = renderHook(() => usePlaceProfilePrompt());

        await waitFor(() => expect(result.current.shouldPrompt).toBe(true));
    });
});
