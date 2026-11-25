import { renderHook } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';

import { runtime } from '@chatic/runtime-react';

import { useLogoutCloudSession } from '../../runtime/useLogoutCloudSession';
import { useSiteSwitch } from '../../runtime/useSiteSwitch';
import { pendingNavigationStore } from './pendingNavigationStore';
import { resolvePushNavigation } from './resolvePushNavigation';
import { useHandlePushNavigation } from './useHandlePushNavigation';
import { configurePerfTraces, getActivePerfTrace, resetPerfTraces } from '@chatic/perf';
import { roomOpenTrace } from '../../runtime/perf';

const mockIsNativeApp = jest.fn(() => false);
const cacheRead = jest.fn();
const getChat = jest.fn();
const channelCacheRead = jest.fn();

jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        connection: {
            waitUntilVerified: jest.fn(),
        },
        data: {
            recoverInvitedCloudIfMissing: jest.fn(),
            useRuntimeRepositories: jest.fn(() => ({
                cloud: {},
                chat: { cacheRead, getChat },
                channel: { cacheRead: channelCacheRead },
            })),
        },
        session: {
            useGlobalSession: jest.fn(),
            useSessionSelection: jest.fn(),
            useSwitchCloudSession: jest.fn(),
        },
        push: {
            get notifications() {
                return mockIsNativeApp() ? { onReceive: jest.fn(() => () => undefined) } : null;
            },
        },
    })
);
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const toast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

jest.mock('../../runtime/useLogoutCloudSession', () => ({ useLogoutCloudSession: jest.fn() }));
jest.mock('../../runtime/useSiteSwitch', () => ({ useSiteSwitch: jest.fn() }));
jest.mock('react-router-dom', () => ({ useNavigate: jest.fn() }));
jest.mock('./pendingNavigationStore', () => ({ pendingNavigationStore: { register: jest.fn() } }));
jest.mock('./resolvePushNavigation', () => ({ resolvePushNavigation: jest.fn() }));
const mockOpenSubWebView = jest.fn();
jest.mock('../../utils/buildEnv', () => ({ isDevBuild: () => false }));
jest.mock('../subWebView', () => ({ openSubWebView: (...args: unknown[]) => mockOpenSubWebView(...args) }));
const mockResolveSubWebViewAppUrl = jest.fn();
let mockSupportsSubWebView = true;
jest.mock('../shellCapabilities', () => ({
    shellCapabilities: { supports: (type: string) => type === 'OpenSubWebView' && mockSupportsSubWebView },
}));
jest.mock('../subWebViewApps', () => ({
    resolveSubWebViewAppUrl: (...args: unknown[]) => mockResolveSubWebViewAppUrl(...args),
}));

const navigate = jest.fn();
const switchCloud = jest.fn();
const switchSite = jest.fn();
const logoutCloudSession = jest.fn();
const waitUntilVerified = jest.fn();
const unregister = jest.fn();

type NavigationMessage = {
    data: {
        path: string;
        replace?: boolean;
        perfTrace?: {
            id: string;
            syncId?: string;
            startedAt: number;
            entry: 'push_tap' | 'deeplink';
            coldStart: boolean;
        };
    };
};
let captured: ((message: NavigationMessage) => Promise<void>) | undefined;

const setResolved = (value: { target: string; cid: string | null; sid: string | null; chatId?: string | null }) =>
    (resolvePushNavigation as jest.Mock).mockReturnValue({ chatId: null, ...value });
const setSelection = (selectedCloudId: string | null, selectedSiteId: string | null) =>
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId, selectedSiteId });
const setActiveServerKind = (kind: 'relay' | 'cloud') =>
    (runtime.session.useGlobalSession as jest.Mock).mockReturnValue({ activeServer: { kind } });

const invoke = async (path = '/x', replace = false) => {
    renderHook(() => useHandlePushNavigation());
    await captured!({ data: { path, replace } });
};

const setCurrentPath = (path: string) => window.history.replaceState({}, '', path);

beforeEach(() => {
    jest.clearAllMocks();
    setCurrentPath('/');
    (useNavigate as jest.Mock).mockReturnValue(navigate);
    switchCloud.mockResolvedValue(undefined);
    switchSite.mockResolvedValue(undefined);
    (runtime.session.useSwitchCloudSession as jest.Mock).mockReturnValue({ switchCloud });
    logoutCloudSession.mockResolvedValue(undefined);
    (useLogoutCloudSession as jest.Mock).mockReturnValue({ logoutCloudSession });
    (useSiteSwitch as jest.Mock).mockReturnValue({ switchSite });
    waitUntilVerified.mockResolvedValue(true);
    (runtime.connection.waitUntilVerified as jest.Mock).mockImplementation((...args: unknown[]) =>
        waitUntilVerified(...args)
    );
    (pendingNavigationStore.register as jest.Mock).mockImplementation((handler: typeof captured) => {
        captured = handler;
        return unregister;
    });
    setSelection('default', 's1');
    setActiveServerKind('relay');
    channelCacheRead.mockResolvedValue(null);
});

describe('useHandlePushNavigation', () => {
    it('마운트 시 pendingNavigationStore에 소비자를 등록하고 언마운트 시 해제한다', () => {
        setResolved({ target: '/x', cid: null, sid: null });

        const { unmount } = renderHook(() => useHandlePushNavigation());
        expect(pendingNavigationStore.register).toHaveBeenCalledTimes(1);

        unmount();
        expect(unregister).toHaveBeenCalledTimes(1);
    });

    describe("a 1:1's push", () => {
        it("switches to the room's cached place, not the place its sender was in", async () => {
            setSelection('c1', 's1');
            setResolved({ target: '/channels/me@peer/room', cid: null, sid: 'P1' });
            channelCacheRead.mockResolvedValue({ id: 'me@peer', sid: 'P2', stereo: 'dm', cid: 'c1' });

            await invoke();

            expect(channelCacheRead).toHaveBeenCalledWith('me@peer');
            expect(switchSite).toHaveBeenCalledWith('P2');
            expect(switchSite).not.toHaveBeenCalledWith('P1');
        });

        it('stays put when the room is in the place already open', async () => {
            setSelection('c1', 'P2');
            setResolved({ target: '/channels/P2@me@peer/room', cid: null, sid: 'P1' });

            await invoke();

            expect(switchSite).not.toHaveBeenCalled();
            expect(navigate).toHaveBeenCalled();
        });

        it("switches to the place its id names after a cloud switch, without reading this cloud's cache", async () => {
            setSelection('c1', 's1');
            setResolved({ target: '/channels/P2@me@peer/room', cid: 'c2', sid: 'P1' });

            await invoke();

            expect(channelCacheRead).not.toHaveBeenCalled();
            expect(switchCloud).toHaveBeenCalledWith('c2');
            expect(switchSite).toHaveBeenCalledWith('P2');
        });

        it("lands on the push's place when the row read never answers", async () => {
            setSelection('c1', 's1');
            setResolved({ target: '/channels/me@peer/room', cid: null, sid: 'P1' });
            channelCacheRead.mockReturnValue(new Promise(() => undefined));

            await invoke();

            expect(switchSite).toHaveBeenCalledWith('P1');
            expect(navigate).toHaveBeenCalled();
        });

        it("keeps a relay 1:1's push on the place it names", async () => {
            setSelection('default', 's1');
            setResolved({ target: '/channels/me@peer/room', cid: null, sid: 'P1' });
            channelCacheRead.mockResolvedValue({ id: 'me@peer', sid: '0000', stereo: 'dm', cid: 'default' });

            await invoke();

            expect(switchSite).toHaveBeenCalledWith('P1');
        });

        it("keeps a group channel's push on the place it names", async () => {
            setSelection('c1', 's1');
            setResolved({ target: '/channels/1000006/room', cid: null, sid: 'P1' });
            channelCacheRead.mockResolvedValue({ id: '1000006', sid: 'P1', stereo: 'private' });

            await invoke();

            expect(switchSite).toHaveBeenCalledWith('P1');
        });
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

    describe("a push into another cloud's main screen", () => {
        it('switches to that cloud and lands on its main screen', async () => {
            setCurrentPath('/mypage');
            setSelection('c1', 's1');
            setResolved({ target: '/', cid: 'c2', sid: null });

            await invoke();

            expect(switchCloud).toHaveBeenCalledWith('c2');
            expect(navigate).toHaveBeenCalledWith('/');
            expect(toast).not.toHaveBeenCalled();
        });

        it('stays put and says so when the cloud cannot be switched to', async () => {
            setCurrentPath('/mypage');
            setSelection('c1', 's1');
            setResolved({ target: '/', cid: 'gone', sid: null });
            switchCloud.mockRejectedValue(new Error('404 NOT FOUND - not found cloud'));

            await invoke();

            expect(navigate).not.toHaveBeenCalled();
            expect(toast).toHaveBeenCalledWith({ title: 'cloudSessionSheet.switchFailed', variant: 'destructive' });
        });

        it('stays put and says so when the socket never verified for the switch', async () => {
            setCurrentPath('/mypage');
            setSelection('c1', 's1');
            setResolved({ target: '/', cid: 'c2', sid: null });
            waitUntilVerified.mockResolvedValue(false);

            await invoke();

            expect(switchCloud).not.toHaveBeenCalled();
            expect(navigate).not.toHaveBeenCalled();
            expect(toast).toHaveBeenCalledWith({ title: 'cloudSessionSheet.switchFailed', variant: 'destructive' });
        });

        it('stays best-effort when the cloud switched and only the place switch failed', async () => {
            setCurrentPath('/mypage');
            setSelection('c1', 's1');
            setResolved({ target: '/', cid: 'c2', sid: 'P9' });
            switchSite.mockRejectedValue(new Error('boom'));

            await invoke();

            expect(navigate).toHaveBeenCalledWith('/');
            expect(toast).not.toHaveBeenCalled();
        });
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
            mockIsNativeApp.mockReturnValue(true);
            try {
                setCloudActive();
                setResolved({ target: '/channels/dm1/room', cid: '#', sid: 's1' });

                await invoke();

                expect(runtime.data.recoverInvitedCloudIfMissing).not.toHaveBeenCalled();
                expect(logoutCloudSession).toHaveBeenCalledTimes(1);
            } finally {
                mockIsNativeApp.mockReturnValue(false);
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

            setCurrentPath('/channels/roomB/room');
            setResolved({ target: '/channels/roomC/room', cid: null, sid: null });
            await invoke();

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
            expect(navigate).toHaveBeenCalledWith('/channels/roomA/room');
        });
    });

    describe('in-flight 가드', () => {
        it('처리 중 겹쳐 들어온 푸시는 드롭한다', async () => {
            setSelection('c1', 's1');
            setResolved({ target: '/channels/roomA/room', cid: 'c2', sid: 's1' });
            let releaseHandshake!: () => void;
            waitUntilVerified.mockImplementation(
                () => new Promise<boolean>(resolve => (releaseHandshake = () => resolve(true)))
            );

            renderHook(() => useHandlePushNavigation());
            const first = captured!({ data: { path: '/x', replace: false } });
            await Promise.resolve();
            const second = captured!({ data: { path: '/x', replace: false } });
            await second;

            expect(switchCloud).not.toHaveBeenCalled();

            releaseHandshake();
            await first;

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
            expect(navigate).toHaveBeenCalledWith('/settings');
        });
    });

    describe('스레드 답글 푸시 — 채널방 → 스레드 2단 이동', () => {
        const REPLY = { id: 'C1:42', channelId: 'C1', chatNo: 42, parentId: '7' };
        const ROOT = { id: 'C1:42', channelId: 'C1', chatNo: 42 };
        const ROOM = '/channels/C1/room';

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

            expect(navigate.mock.calls).toEqual([[ROOM], ['/channels/C1/thread/7']]);
        });

        it('다른 방에 있었으면 그 방을 대체하고 스레드를 올린다 (뒤로가기 → 대상 채널방)', async () => {
            setCurrentPath('/channels/OTHER/room');
            cacheRead.mockResolvedValue(REPLY);
            setResolved({ target: ROOM, cid: null, sid: null, chatId: 'C1:42' });

            await invoke();

            expect(navigate.mock.calls).toEqual([[ROOM, { replace: true }], ['/channels/C1/thread/7']]);
        });

        it('이미 그 방에 있었으면 방 이동을 건너뛰고 스레드만 올린다 (뒤로가기 → 그 방)', async () => {
            setCurrentPath(ROOM);
            cacheRead.mockResolvedValue(REPLY);
            setResolved({ target: ROOM, cid: null, sid: null, chatId: 'C1:42' });

            await invoke();

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
    describe('room-open trace', () => {
        const backend = { start: jest.fn(), stop: jest.fn() };

        beforeEach(() => {
            roomOpenTrace.reset();
            configurePerfTraces(backend);
        });

        afterEach(() => resetPerfTraces());

        const finish = () => {
            const trace = roomOpenTrace.claim('roomA');
            trace?.stop();
            return backend.stop.mock.calls[0]?.[0];
        };

        it('carries on the trace the native tap started, marking where the handler took over', async () => {
            setResolved({ target: '/channels/roomA/room', cid: null, sid: null });
            renderHook(() => useHandlePushNavigation());

            await captured!({
                data: {
                    path: '/channels/roomA/room',
                    perfTrace: {
                        id: 'native-1',
                        syncId: 'native-sync-1',
                        startedAt: Date.now() - 500,
                        entry: 'push_tap',
                        coldStart: true,
                    },
                },
            });

            expect(backend.start).not.toHaveBeenCalled();
            const result = finish();
            expect(result).toMatchObject({ id: 'native-1', attributes: { entry: 'push_tap', start: 'cold' } });
            expect(result.metrics.handler).toBeGreaterThanOrEqual(500);
        });

        it('starts its own trace for an app build that sends none', async () => {
            setResolved({ target: '/channels/roomA/room', cid: null, sid: null });

            await invoke('/channels/roomA/room');

            expect(backend.start).toHaveBeenCalledTimes(2);
            expect(finish()).toMatchObject({ attributes: { entry: 'navigate' } });
        });

        it('records which switch ran and when it finished', async () => {
            setSelection('c1', 's1');
            setResolved({ target: '/channels/roomA/room', cid: 'c2', sid: 's1' });

            await invoke('/channels/roomA/room');

            const result = finish();
            expect(result.attributes).toMatchObject({ switch: 'cloud' });
            expect(result.metrics).toHaveProperty('switch_done');
        });

        it('marks each step of a cloud-and-place switch as it finishes', async () => {
            setSelection('c1', 's1');
            setResolved({ target: '/channels/roomA/room', cid: 'c2', sid: 's2' });

            await invoke('/channels/roomA/room');

            const { metrics } = finish();
            expect(metrics).toHaveProperty('handshake_done');
            expect(metrics).toHaveProperty('cloud_done');
            expect(metrics).toHaveProperty('switch_done');
            expect(metrics).not.toHaveProperty('recover_done');
        });

        it('marks the recovery step when the native app runs it', async () => {
            mockIsNativeApp.mockReturnValueOnce(true);
            setSelection('c1', 's1');
            setResolved({ target: '/channels/roomA/room', cid: 'c2', sid: 's1' });

            await invoke('/channels/roomA/room');

            expect(runtime.data.recoverInvitedCloudIfMissing).toHaveBeenCalled();
            expect(finish().metrics).toHaveProperty('recover_done');
        });

        it('leaves no cloud mark for a place-only switch', async () => {
            setSelection('c1', 's1');
            setResolved({ target: '/channels/roomA/room', cid: 'c1', sid: 's2' });

            await invoke('/channels/roomA/room');

            const { metrics } = finish();
            expect(metrics).toHaveProperty('handshake_done');
            expect(metrics).not.toHaveProperty('cloud_done');
            expect(metrics).toHaveProperty('switch_done');
        });

        it('marks each step after it finishes, on the sync trace as well', async () => {
            let now = 0;
            const clock = jest.spyOn(performance, 'now').mockImplementation(() => now);
            switchCloud.mockImplementation(async () => {
                now += 1000;
            });
            switchSite.mockImplementation(async () => {
                now += 500;
            });
            setSelection('c1', 's1');
            setResolved({ target: '/channels/roomA/room', cid: 'c2', sid: 's2' });

            try {
                await invoke('/channels/roomA/room');

                const sync = getActivePerfTrace('chat_room_sync', 'roomA');
                expect(finish().metrics).toMatchObject({ handshake_done: 0, cloud_done: 1000, switch_done: 1500 });
                expect(sync?.getMetric('cloud_done')).toBe(1000);
                expect(sync?.getMetric('switch_done')).toBe(1500);
            } finally {
                clock.mockRestore();
            }
        });

        it('marks no switch step when the handshake times out', async () => {
            setSelection('c1', 's1');
            setResolved({ target: '/channels/roomA/room', cid: 'c2', sid: 's2' });
            waitUntilVerified.mockResolvedValue(false);

            await invoke('/channels/roomA/room');

            const { metrics } = finish();
            for (const mark of ['handshake_done', 'recover_done', 'cloud_done', 'switch_done']) {
                expect(metrics).not.toHaveProperty(mark);
            }
        });

        it('starts nothing for a navigation that does not open a room', async () => {
            setResolved({ target: '/mypage', cid: null, sid: null });

            await invoke('/mypage');

            expect(backend.start).not.toHaveBeenCalled();
        });
    });

    describe("a sub WebView page's link", () => {
        const page = 'https://quiz.apps.chatic.io/level?x=1';
        const path = `/sub-webview?url=${encodeURIComponent(page)}`;

        beforeEach(() => {
            mockSupportsSubWebView = true;
            setResolved({ target: '/', cid: null, sid: null });
        });

        it('opens the page and does not navigate', async () => {
            mockOpenSubWebView.mockResolvedValue({ via: 'subWebView', viewId: 'v1' });

            await invoke(path);

            expect(mockOpenSubWebView).toHaveBeenCalledWith({ url: page });
            expect(navigate).not.toHaveBeenCalled();
            expect(switchCloud).not.toHaveBeenCalled();
        });

        it("opens the app a link names, at its root with the link's query", async () => {
            mockResolveSubWebViewAppUrl.mockResolvedValue('https://quiz.apps.chatic.io/?level=3');
            mockOpenSubWebView.mockResolvedValue({ via: 'subWebView', viewId: 'v1' });

            await invoke('/apps/quiz?level=3');

            expect(mockResolveSubWebViewAppUrl).toHaveBeenCalledWith({ appId: 'quiz', query: '?level=3' }, 'prod');
            expect(mockOpenSubWebView).toHaveBeenCalledWith({
                url: 'https://quiz.apps.chatic.io/?level=3',
                appId: 'quiz',
            });
            expect(navigate).not.toHaveBeenCalled();
        });

        it('opens nothing in an app without the sub WebView', async () => {
            mockSupportsSubWebView = false;
            mockResolveSubWebViewAppUrl.mockResolvedValue('https://quiz.apps.chatic.io/');

            await invoke('/apps/quiz');
            await invoke(path);

            expect(mockOpenSubWebView).not.toHaveBeenCalled();
            expect(navigate).not.toHaveBeenCalled();
        });

        it('opens nothing and stays put for an app it does not know', async () => {
            mockResolveSubWebViewAppUrl.mockResolvedValue(null);

            await invoke('/apps/unknown');

            expect(mockOpenSubWebView).not.toHaveBeenCalled();
            expect(navigate).not.toHaveBeenCalled();
        });

        it('routes a path that names a site other than a page', async () => {
            await invoke(`/sub-webview?url=${encodeURIComponent('https://evil.example/')}`);

            expect(mockOpenSubWebView).not.toHaveBeenCalled();
        });

        it('stays put when the shell refuses the page', async () => {
            mockOpenSubWebView.mockRejectedValue(new Error('NOT_ALLOWED'));

            await expect(invoke(path)).resolves.toBeUndefined();

            expect(navigate).not.toHaveBeenCalled();
        });
    });
});
