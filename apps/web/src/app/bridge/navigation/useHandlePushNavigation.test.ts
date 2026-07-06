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

beforeEach(() => {
    jest.clearAllMocks();
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
        setResolved({ target: '/home', cid: null, sid: null });

        await invoke();

        expect(waitUntilVerified).not.toHaveBeenCalled();
        expect(switchCloud).not.toHaveBeenCalled();
        expect(switchSite).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('/home', { replace: false });
    });

    it('skips the wait when cid/sid already match the active selection', async () => {
        setSelection('default', 's1');
        setResolved({ target: '/room', cid: 'default', sid: 's1' });

        await invoke();

        expect(waitUntilVerified).not.toHaveBeenCalled();
        expect(switchCloud).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('/room', { replace: false });
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
        expect(navigate).toHaveBeenCalledWith('/room', { replace: false });
    });

    it('navigates best-effort when a switch throws', async () => {
        setSelection('c1', 's1');
        setResolved({ target: '/room', cid: 'c2', sid: 's1' });
        switchCloud.mockRejectedValue(new Error('boom'));

        await invoke();

        expect(navigate).toHaveBeenCalledWith('/room', { replace: false });
    });

    it('honors the replace flag', async () => {
        setResolved({ target: '/home', cid: null, sid: null });

        await invoke('/home', true);

        expect(navigate).toHaveBeenCalledWith('/home', { replace: true });
    });
});
