import { renderHook } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';

import { getSocketManager } from '@chatic/app-runtime';
import { useSessionSelection, useSiteSwitch, useSwitchCloudSession } from '@chatic/web-core';

import { useOnNavigate } from '../useHandleAppMessage';
import { resolvePushNavigation } from './resolvePushNavigation';
import { useHandlePushNavigation } from './useHandlePushNavigation';

jest.mock('@chatic/app-runtime', () => ({ getSocketManager: jest.fn() }));
jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@chatic/web-core', () => ({
    useSessionSelection: jest.fn(),
    useSiteSwitch: jest.fn(),
    useSwitchCloudSession: jest.fn(),
}));
jest.mock('react-router-dom', () => ({ useNavigate: jest.fn() }));
jest.mock('../useHandleAppMessage', () => ({ useOnNavigate: jest.fn() }));
jest.mock('./resolvePushNavigation', () => ({ resolvePushNavigation: jest.fn() }));

const navigate = jest.fn();
const switchCloud = jest.fn();
const switchSite = jest.fn();
const waitUntilVerified = jest.fn();

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

// Normalization reads the live pathname from window.location (jsdom), so tests
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
    (useOnNavigate as jest.Mock).mockImplementation((handler: typeof captured) => {
        captured = handler;
    });
    setSelection('default', 's1');
});

describe('useHandlePushNavigation', () => {
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
        it('방 화면에서 다른 방 푸시를 받으면 현재 엔트리를 홈으로 rebase한 뒤 target을 push한다', async () => {
            setCurrentPath('/channels/roomA/room');
            setResolved({ target: '/channels/roomB/room', cid: null, sid: null });

            await invoke();

            expect(navigate).toHaveBeenNthCalledWith(1, '/', { replace: true });
            expect(navigate).toHaveBeenNthCalledWith(2, '/channels/roomB/room');
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

        it('target에 쿼리가 붙어 있어도 pathname 기준으로 같은 화면이면 생략한다', async () => {
            setCurrentPath('/channels/roomA/room');
            setResolved({ target: '/channels/roomA/room?from=push', cid: null, sid: null });

            await invoke();

            expect(navigate).not.toHaveBeenCalled();
        });

        it('네이티브 replace 플래그와 무관하게 정규화 규칙대로 네비게이션한다', async () => {
            setCurrentPath('/mypage');
            setResolved({ target: '/channels/roomA/room', cid: null, sid: null });

            await invoke('/channels/roomA/room', true);

            expect(navigate).toHaveBeenNthCalledWith(1, '/', { replace: true });
            expect(navigate).toHaveBeenNthCalledWith(2, '/channels/roomA/room');
        });
    });
});
