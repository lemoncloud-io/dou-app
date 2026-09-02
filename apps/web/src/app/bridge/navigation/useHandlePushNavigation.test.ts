import { renderHook } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';

import { getSocketManager, isNativeApp, recoverInvitedCloudIfMissing } from '@chatic/app-runtime';
import { useGlobalSession, useSessionSelection, useSwitchCloudSession } from '@chatic/app-runtime';

import { useLogoutCloudSession } from '../../runtime/useLogoutCloudSession';
import { useSiteSwitch } from '../../runtime/useSiteSwitch';
import { pendingNavigationStore } from './pendingNavigationStore';
import { resolvePushNavigation } from './resolvePushNavigation';
import { useHandlePushNavigation } from './useHandlePushNavigation';

// The invited-cloud recovery step added to usePushNavigate pulls three more app-runtime exports.
// isNativeApp must be present and falsy: an undefined stub throws inside the switch block, which
// the best-effort catch swallows into a plain navigate — silently losing the cloud/site switch this
// suite asserts on. The recovery itself is native-only, so it never runs here.
const cacheRead = jest.fn();
const getChat = jest.fn();

jest.mock('@chatic/app-runtime', () => ({
    getSocketManager: jest.fn(),
    isNativeApp: jest.fn(() => false),
    recoverInvitedCloudIfMissing: jest.fn(),
    // `chat` backs the thread-hop leg (usePushNavigate.hopToThread); the mock functions are
    // hoisted above this factory so the suite can drive them.
    useRuntimeRepositories: jest.fn(() => ({ cloud: {}, chat: { cacheRead, getChat } })),
    useGlobalSession: jest.fn(),
    useSessionSelection: jest.fn(),
    useSwitchCloudSession: jest.fn(),
}));
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

jest.mock('../../runtime/useLogoutCloudSession', () => ({ useLogoutCloudSession: jest.fn() }));
jest.mock('../../runtime/useSiteSwitch', () => ({ useSiteSwitch: jest.fn() }));
jest.mock('react-router-dom', () => ({ useNavigate: jest.fn() }));
jest.mock('./pendingNavigationStore', () => ({ pendingNavigationStore: { register: jest.fn() } }));
jest.mock('./resolvePushNavigation', () => ({ resolvePushNavigation: jest.fn() }));

const navigate = jest.fn();
const switchCloud = jest.fn();
const switchSite = jest.fn();
const logoutCloudSession = jest.fn();
const waitUntilVerified = jest.fn();
const unregister = jest.fn();

type NavigationMessage = { data: { path: string; replace?: boolean } };
let captured: ((message: NavigationMessage) => Promise<void>) | undefined;

const setResolved = (value: { target: string; cid: string | null; sid: string | null; chatId?: string | null }) =>
    (resolvePushNavigation as jest.Mock).mockReturnValue({ chatId: null, ...value });
const setSelection = (selectedCloudId: string | null, selectedSiteId: string | null) =>
    (useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId, selectedSiteId });
// The relay-return branch reads the committed context kind, not the selection (see usePushNavigate).
const setActiveServerKind = (kind: 'relay' | 'cloud') =>
    (useGlobalSession as jest.Mock).mockReturnValue({ activeServer: { kind } });

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
    logoutCloudSession.mockResolvedValue(undefined);
    (useLogoutCloudSession as jest.Mock).mockReturnValue({ logoutCloudSession });
    (useSiteSwitch as jest.Mock).mockReturnValue({ switchSite });
    waitUntilVerified.mockResolvedValue(true);
    (getSocketManager as jest.Mock).mockReturnValue({ waitUntilVerified });
    (pendingNavigationStore.register as jest.Mock).mockImplementation((handler: typeof captured) => {
        captured = handler;
        return unregister;
    });
    setSelection('default', 's1');
    setActiveServerKind('relay');
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

    describe("중계서버 푸시 (cid='#') — ADR-0045 크로스오버", () => {
        const setCloudActive = (siteId: string | null = 's1') => {
            setSelection('c1', siteId);
            setActiveServerKind('cloud');
        };

        it('클라우드 활성 중이면 switchCloud 대신 logoutCloudSession으로 relay에 복귀한 뒤 이동한다', async () => {
            setCloudActive();
            setResolved({ target: '/channels/dm1/room', cid: '#', sid: 's1' });

            const order: string[] = [];
            waitUntilVerified.mockImplementation(async () => {
                order.push('wait');
                return true;
            });
            logoutCloudSession.mockImplementation(async () => {
                order.push('logout');
            });
            navigate.mockImplementation(() => {
                order.push('navigate');
            });

            await invoke();

            expect(order).toEqual(['wait', 'logout', 'navigate']);
            expect(switchCloud).not.toHaveBeenCalled();
            expect(navigate).toHaveBeenCalledWith('/channels/dm1/room');
        });

        it('이미 relay 컨텍스트면 아무 전환 없이 바로 이동한다 (switchCloud("#") 회귀 방지)', async () => {
            setSelection('default', 's1');
            setActiveServerKind('relay');
            setResolved({ target: '/channels/dm1/room', cid: '#', sid: 's1' });

            await invoke();

            expect(waitUntilVerified).not.toHaveBeenCalled();
            expect(logoutCloudSession).not.toHaveBeenCalled();
            expect(switchCloud).not.toHaveBeenCalled();
            expect(navigate).toHaveBeenCalledWith('/channels/dm1/room');
        });

        it("'#'는 native여도 invited-cloud 복구 대상이 아니다", async () => {
            // clearAllMocks는 mockReturnValue를 지우지 않으므로 테스트 안에서 원복한다.
            (isNativeApp as jest.Mock).mockReturnValue(true);
            try {
                setCloudActive();
                setResolved({ target: '/channels/dm1/room', cid: '#', sid: 's1' });

                await invoke();

                expect(recoverInvitedCloudIfMissing).not.toHaveBeenCalled();
                expect(logoutCloudSession).toHaveBeenCalledTimes(1);
            } finally {
                (isNativeApp as jest.Mock).mockReturnValue(false);
            }
        });

        it('relay 복귀가 실패해도 best-effort로 이동한다', async () => {
            setCloudActive();
            setResolved({ target: '/channels/dm1/room', cid: '#', sid: 's1' });
            logoutCloudSession.mockRejectedValue(new Error('boom'));

            await invoke();

            expect(navigate).toHaveBeenCalledWith('/channels/dm1/room');
        });

        it('sid가 다르면 relay 복귀 후 기존 switchSite 분기가 이어진다', async () => {
            setCloudActive('s1');
            setResolved({ target: '/channels/dm1/room', cid: '#', sid: 's2' });

            const order: string[] = [];
            logoutCloudSession.mockImplementation(async () => {
                order.push('logout');
            });
            switchSite.mockImplementation(async () => {
                order.push('site');
            });
            navigate.mockImplementation(() => {
                order.push('navigate');
            });

            await invoke();

            expect(order).toEqual(['logout', 'site', 'navigate']);
            expect(switchSite).toHaveBeenCalledWith('s2');
            expect(switchCloud).not.toHaveBeenCalled();
        });
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

        it('방이 아닌 화면에서 받은 푸시는 그 화면을 남기고 push한다 (뒤로가기가 돌아올 자리)', async () => {
            // 회귀: 마이페이지에서 인앱 메시지를 탭하면 마이페이지를 replace해서 뒤로가기가
            // 건너뛰었고, 마이페이지가 유일한 엔트리면 돌아갈 곳이 아예 없었다.
            setCurrentPath('/mypage');
            setResolved({ target: '/channels/roomA/room', cid: null, sid: null });

            await invoke();

            expect(navigate).toHaveBeenCalledTimes(1);
            expect(navigate).toHaveBeenCalledWith('/channels/roomA/room');
        });

        it('방의 하위 화면(설정)도 남기고 push한다 — 방 자체만 버릴 수 있다', async () => {
            setCurrentPath('/channels/roomA/settings');
            setResolved({ target: '/channels/roomB/room', cid: null, sid: null });

            await invoke();

            expect(navigate).toHaveBeenCalledWith('/channels/roomB/room');
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
            // 네이티브가 replace를 요청해도 규칙이 이긴다 — 방이 아닌 화면이므로 push다.
            setCurrentPath('/mypage');
            setResolved({ target: '/channels/roomA/room', cid: null, sid: null });

            await invoke('/channels/roomA/room', true);

            expect(navigate).toHaveBeenCalledTimes(1);
            expect(navigate).toHaveBeenCalledWith('/channels/roomA/room');
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

    // A reply raises a push of its own but is hidden from the main feed (ADR-0045), so a
    // channel-level tap would show everything except the message that was notified. The fix is
    // staged: land on the room, then hop to the thread only if the notified chat is a reply.
    describe('스레드 답글 푸시 — 채널방 → 스레드 2단 이동', () => {
        const REPLY = { id: 'C1:42', channelId: 'C1', chatNo: 42, parentId: '7' };
        const ROOT = { id: 'C1:42', channelId: 'C1', chatNo: 42 };
        const ROOM = '/channels/C1/room';

        // The real router's navigate() writes to the History API synchronously, so
        // window.location is already the room by the time the thread leg reads it. The shared
        // navigate mock does not, so mirror that here — hopToThread guards on the live location.
        beforeEach(() => {
            navigate.mockImplementation((target: unknown) => {
                if (typeof target === 'string') window.history.replaceState({}, '', target);
            });
        });

        afterEach(() => {
            navigate.mockReset();
            cacheRead.mockReset();
            getChat.mockReset();
        });

        it('답글 푸시는 채널방을 먼저 열고 그 위에 스레드를 push한다', async () => {
            cacheRead.mockResolvedValue(REPLY);
            setResolved({ target: ROOM, cid: null, sid: null, chatId: 'C1:42' });

            await invoke();

            // The thread leg must PUSH, not replace: routing it through navigateNormalized would
            // replace the room (its room-to-room rule) and send "back" past the channel to home.
            expect(navigate.mock.calls).toEqual([[ROOM], ['/channels/C1/thread/7']]);
        });

        // The room leg behaves differently depending on where the reader was, but the back stack
        // must come out the same in every case: back from the thread lands on the channel.
        it('다른 방에 있었으면 그 방을 대체하고 스레드를 올린다 (뒤로가기 → 대상 채널방)', async () => {
            setCurrentPath('/channels/OTHER/room');
            cacheRead.mockResolvedValue(REPLY);
            setResolved({ target: ROOM, cid: null, sid: null, chatId: 'C1:42' });

            await invoke();

            // Room leg replaces the disposable peer room; the thread leg still pushes on top of it.
            expect(navigate.mock.calls).toEqual([[ROOM, { replace: true }], ['/channels/C1/thread/7']]);
        });

        it('이미 그 방에 있었으면 방 이동을 건너뛰고 스레드만 올린다 (뒤로가기 → 그 방)', async () => {
            setCurrentPath(ROOM);
            cacheRead.mockResolvedValue(REPLY);
            setResolved({ target: ROOM, cid: null, sid: null, chatId: 'C1:42' });

            await invoke();

            // Re-navigating to the screen already shown would remount it; the room is already the
            // current history entry, so pushing the thread on top still leaves back pointing at it.
            expect(navigate.mock.calls).toEqual([['/channels/C1/thread/7']]);
        });

        it('최상위 메시지 푸시는 채널방에서 멈춘다', async () => {
            cacheRead.mockResolvedValue(ROOT);
            setResolved({ target: ROOM, cid: null, sid: null, chatId: 'C1:42' });

            await invoke();

            expect(navigate.mock.calls).toEqual([[ROOM]]);
        });

        it('캐시에 없으면 getChat으로 조회해 스레드를 판정한다', async () => {
            cacheRead.mockResolvedValue(null);
            getChat.mockResolvedValue(REPLY);
            setResolved({ target: ROOM, cid: null, sid: null, chatId: 'C1:42' });

            await invoke();

            expect(getChat).toHaveBeenCalledWith({ id: 'C1:42' });
            expect(navigate).toHaveBeenLastCalledWith('/channels/C1/thread/7');
        });

        // Offline / cold cache: the reader is already on a screen that makes sense.
        it('조회가 실패하면 채널방에 그대로 머문다', async () => {
            cacheRead.mockRejectedValue(new Error('offline'));
            setResolved({ target: ROOM, cid: null, sid: null, chatId: 'C1:42' });

            await invoke();

            expect(navigate.mock.calls).toEqual([[ROOM]]);
        });

        it('chatId가 없는 푸시는 조회 자체를 하지 않는다', async () => {
            setResolved({ target: ROOM, cid: null, sid: null });

            await invoke();

            expect(cacheRead).not.toHaveBeenCalled();
            expect(navigate.mock.calls).toEqual([[ROOM]]);
        });

        // The lookup is awaited, which gives the reader time to move on. Hijacking a screen they
        // chose would be worse than skipping the hop.
        it('조회 중 사용자가 방을 떠났으면 스레드로 끌고 가지 않는다', async () => {
            cacheRead.mockImplementation(async () => {
                window.history.replaceState({}, '', '/mypage');
                return REPLY;
            });
            setResolved({ target: ROOM, cid: null, sid: null, chatId: 'C1:42' });

            await invoke();

            expect(navigate.mock.calls).toEqual([[ROOM]]);
        });
    });
});
