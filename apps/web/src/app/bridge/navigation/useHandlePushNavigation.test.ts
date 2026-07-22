import { renderHook } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';

import { getSocketManager } from '@chatic/app-runtime';
import { useSessionSelection, useSwitchCloudSession } from '@chatic/web-core';

import { useSiteSwitch } from '../../runtime/useSiteSwitch';
import { pendingNavigationStore } from './pendingNavigationStore';
import { resolvePushNavigation } from './resolvePushNavigation';
import { useHandlePushNavigation } from './useHandlePushNavigation';

jest.mock('@chatic/app-runtime', () => ({ getSocketManager: jest.fn() }));
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@chatic/web-core', () => ({
    useSessionSelection: jest.fn(),
    useSwitchCloudSession: jest.fn(),
}));
jest.mock('../../runtime/useSiteSwitch', () => ({ useSiteSwitch: jest.fn() }));
jest.mock('react-router-dom', () => ({ useNavigate: jest.fn() }));
jest.mock('./pendingNavigationStore', () => ({ pendingNavigationStore: { register: jest.fn() } }));
jest.mock('./resolvePushNavigation', () => ({ resolvePushNavigation: jest.fn() }));

const navigate = jest.fn();
const switchCloud = jest.fn();
const switchSite = jest.fn();
const waitUntilVerified = jest.fn();
const unregister = jest.fn();

type NavigationMessage = { data: { path: string; replace?: boolean } };
let captured: ((message: NavigationMessage) => Promise<void>) | undefined;

const setResolved = (value: { target: string; cid: string | null; sid: string | null }) =>
    (resolvePushNavigation as jest.Mock).mockReturnValue(value);
const setSelection = (selectedCloudId: string | null, selectedSiteId: string | null) =>
    (useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId, selectedSiteId });

const invoke = async (path = '/x', replace = false) => {
    renderHook(() => useHandlePushNavigation());
    await captured!({ data: { path, replace } });
};

// Normalization reads the live pathname+search from window.location (jsdom), so tests
// drive the "current screen" through the history API rather than a router mock.
const setCurrentPath = (path: string) => window.history.replaceState({}, '', path);

beforeEach(() => {
    jest.clearAllMocks();
    setCurrentPath('/');
    (useNavigate as jest.Mock).mockReturnValue(navigate);
    switchCloud.mockResolvedValue(undefined);
    switchSite.mockResolvedValue(undefined);
    (useSwitchCloudSession as jest.Mock).mockReturnValue({ switchCloud });
    (useSiteSwitch as jest.Mock).mockReturnValue({ switchSite });
    waitUntilVerified.mockResolvedValue(true);
    (getSocketManager as jest.Mock).mockReturnValue({ waitUntilVerified });
    (pendingNavigationStore.register as jest.Mock).mockImplementation((handler: typeof captured) => {
        captured = handler;
        return unregister;
    });
    setSelection('default', 's1');
});

describe('useHandlePushNavigation', () => {
    it('마운트 시 pendingNavigationStore에 소비자를 등록하고 언마운트 시 해제한다', () => {
        setResolved({ target: '/x', cid: null, sid: null });

        const { unmount } = renderHook(() => useHandlePushNavigation());
        expect(pendingNavigationStore.register).toHaveBeenCalledTimes(1);

        unmount();
        expect(unregister).toHaveBeenCalledTimes(1);
    });

    it('waits for the handshake, then switches cloud-before-site, then navigates', async () => {
        setSelection('c1', 's1');
        setResolved({ target: '/room', cid: 'c2', sid: 's2' });

        const order: string[] = [];
        waitUntilVerified.mockImplementation(async () => {
            order.push('wait');
            return true;
        });
        switchCloud.mockImplementation(async () => {
            order.push('cloud');
        });
        switchSite.mockImplementation(async () => {
            order.push('site');
        });
        navigate.mockImplementation(() => {
            order.push('navigate');
        });

        await invoke();

        expect(order).toEqual(['wait', 'cloud', 'site', 'navigate']);
    });

    it('navigates directly without waiting for a plain in-app path (no cid/sid)', async () => {
        setResolved({ target: '/mypage', cid: null, sid: null });

        await invoke();

        expect(waitUntilVerified).not.toHaveBeenCalled();
        expect(switchCloud).not.toHaveBeenCalled();
        expect(switchSite).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('/mypage');
    });

    it('skips the wait when cid/sid already match the active selection', async () => {
        setSelection('default', 's1');
        setResolved({ target: '/room', cid: 'default', sid: 's1' });

        await invoke();

        expect(waitUntilVerified).not.toHaveBeenCalled();
        expect(switchCloud).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('/room');
    });

    it('switches only the cloud when only the cloud changes', async () => {
        setSelection('c1', 's1');
        setResolved({ target: '/room', cid: 'c2', sid: 's1' });

        await invoke();

        expect(waitUntilVerified).toHaveBeenCalledTimes(1);
        expect(switchCloud).toHaveBeenCalledWith('c2');
        expect(switchSite).not.toHaveBeenCalled();
    });

    it('skips the switch but still navigates when the handshake times out', async () => {
        setSelection('c1', 's1');
        setResolved({ target: '/room', cid: 'c2', sid: 's2' });
        waitUntilVerified.mockResolvedValue(false);

        await invoke();

        expect(switchCloud).not.toHaveBeenCalled();
        expect(switchSite).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('/room');
    });

    it('navigates best-effort when a switch throws', async () => {
        setSelection('c1', 's1');
        setResolved({ target: '/room', cid: 'c2', sid: 's1' });
        switchCloud.mockRejectedValue(new Error('boom'));

        await invoke();

        expect(navigate).toHaveBeenCalledWith('/room');
    });

    describe('히스토리 정규화', () => {
        it('방 화면에서 다른 방 푸시를 받으면 현재 엔트리를 target으로 replace한다 (스택 누적 없음)', async () => {
            setCurrentPath('/channels/roomA/room');
            setResolved({ target: '/channels/roomB/room', cid: null, sid: null });

            await invoke();

            expect(navigate).toHaveBeenCalledTimes(1);
            expect(navigate).toHaveBeenCalledWith('/channels/roomB/room', { replace: true });
        });

        it('반복 푸시는 매번 replace라 홈을 거치지 않고 히스토리가 누적되지 않는다', async () => {
            setCurrentPath('/channels/roomA/room');
            setResolved({ target: '/channels/roomB/room', cid: null, sid: null });
            await invoke();

            // 두 번째 푸시: 앞선 replace로 이동한 방에서 또 다른 방으로.
            setCurrentPath('/channels/roomB/room');
            setResolved({ target: '/channels/roomC/room', cid: null, sid: null });
            await invoke();

            // 홈으로 rebase(push)하는 일이 없어야 한다 — 매번 현재 엔트리를 대체.
            expect(navigate).not.toHaveBeenCalledWith('/', { replace: true });
            expect(navigate).toHaveBeenCalledWith('/channels/roomB/room', { replace: true });
            expect(navigate).toHaveBeenCalledWith('/channels/roomC/room', { replace: true });
        });

        it('홈에 있으면 rebase 없이 target만 push한다', async () => {
            setCurrentPath('/');
            setResolved({ target: '/channels/roomA/room', cid: null, sid: null });

            await invoke();

            expect(navigate).toHaveBeenCalledTimes(1);
            expect(navigate).toHaveBeenCalledWith('/channels/roomA/room');
        });

        it('이미 target 경로에 있으면 네비게이션을 생략한다', async () => {
            setCurrentPath('/channels/roomA/room');
            setResolved({ target: '/channels/roomA/room', cid: null, sid: null });

            await invoke();

            expect(navigate).not.toHaveBeenCalled();
        });

        it('pathname과 쿼리가 모두 같으면 네비게이션을 생략한다', async () => {
            setCurrentPath('/channels/roomA/room?from=push');
            setResolved({ target: '/channels/roomA/room?from=push', cid: null, sid: null });

            await invoke();

            expect(navigate).not.toHaveBeenCalled();
        });

        it('같은 pathname이라도 쿼리가 다르면 생략하지 않고 target으로 replace한다', async () => {
            setCurrentPath('/channels/roomA/room');
            setResolved({ target: '/channels/roomA/room?from=push', cid: null, sid: null });

            await invoke();

            expect(navigate).toHaveBeenCalledTimes(1);
            expect(navigate).toHaveBeenCalledWith('/channels/roomA/room?from=push', { replace: true });
        });

        it('홈에서 초대 딥링크(쿼리만 다른 홈 타겟)를 받으면 rebase 없이 target을 push한다', async () => {
            // Regression: the invite deeplink shares the home pathname, so the old
            // pathname-only skip dropped its query and the invite popup never showed.
            setCurrentPath('/');
            setResolved({
                target: '/?code=abc&provider=invite&version=2&_backend=https%3A%2F%2Fapi',
                cid: null,
                sid: null,
            });

            await invoke();

            expect(navigate).toHaveBeenCalledTimes(1);
            expect(navigate).toHaveBeenCalledWith('/?code=abc&provider=invite&version=2&_backend=https%3A%2F%2Fapi');
        });

        it('네이티브 replace 플래그와 무관하게 정규화 규칙대로 네비게이션한다', async () => {
            setCurrentPath('/mypage');
            setResolved({ target: '/channels/roomA/room', cid: null, sid: null });

            await invoke('/channels/roomA/room', true);

            expect(navigate).toHaveBeenCalledTimes(1);
            expect(navigate).toHaveBeenCalledWith('/channels/roomA/room', { replace: true });
        });
    });

    describe('in-flight 가드', () => {
        it('처리 중 겹쳐 들어온 푸시는 드롭한다', async () => {
            setSelection('c1', 's1');
            setResolved({ target: '/channels/roomA/room', cid: 'c2', sid: 's1' });
            // Hold the handshake so the first push stays in flight while the second arrives.
            let releaseHandshake!: () => void;
            waitUntilVerified.mockImplementation(
                () => new Promise<boolean>(resolve => (releaseHandshake = () => resolve(true)))
            );

            renderHook(() => useHandlePushNavigation());
            const first = captured!({ data: { path: '/x', replace: false } });
            await Promise.resolve(); // let the first reach the awaited handshake
            const second = captured!({ data: { path: '/x', replace: false } });
            await second; // dropped immediately while the first is in flight

            expect(switchCloud).not.toHaveBeenCalled(); // first still awaiting the handshake

            releaseHandshake();
            await first;

            // Only the first push proceeded through the switch + navigation.
            expect(switchCloud).toHaveBeenCalledTimes(1);
            expect(navigate).toHaveBeenCalledTimes(1);
        });

        it('처리 완료 후에는 같은 인스턴스에서 다음 푸시를 정상 처리한다 (가드 해제)', async () => {
            renderHook(() => useHandlePushNavigation());

            setResolved({ target: '/mypage', cid: null, sid: null });
            await captured!({ data: { path: '/mypage', replace: false } });
            expect(navigate).toHaveBeenCalledWith('/mypage');

            navigate.mockClear();
            setResolved({ target: '/settings', cid: null, sid: null });
            await captured!({ data: { path: '/settings', replace: false } });
            expect(navigate).toHaveBeenCalledWith('/settings'); // not dropped → guard reset
        });
    });
});
