import { renderHook } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';

import { getSocketManager, useSiteSwitch } from '@chatic/app-runtime';
import { useSessionSelection, useSwitchCloudSession } from '@chatic/web-core';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useSearchNavigate } from './useSearchNavigate';

jest.mock('@chatic/app-runtime', () => ({ getSocketManager: jest.fn(), useSiteSwitch: jest.fn() }));
jest.mock('@chatic/web-core', () => ({
    useSessionSelection: jest.fn(),
    useSwitchCloudSession: jest.fn(),
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: jest.fn() }));
jest.mock('react-router-dom', () => ({ useNavigate: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));

const navigate = jest.fn();
const switchCloud = jest.fn();
const switchSite = jest.fn();
const toast = jest.fn();
const waitUntilVerified = jest.fn();

const setSelection = (selectedCloudId: string | null, selectedSiteId: string | null = null) =>
    (useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId, selectedSiteId });

beforeEach(() => {
    jest.clearAllMocks();
    (useNavigate as jest.Mock).mockReturnValue(navigate);
    switchCloud.mockResolvedValue(undefined);
    switchSite.mockResolvedValue(undefined);
    (useSwitchCloudSession as jest.Mock).mockReturnValue({ switchCloud });
    (useSiteSwitch as jest.Mock).mockReturnValue({ switchSite });
    (useToast as jest.Mock).mockReturnValue({ toast });
    waitUntilVerified.mockResolvedValue(true);
    (getSocketManager as jest.Mock).mockReturnValue({ waitUntilVerified });
    setSelection('default');
});

describe('useSearchNavigate', () => {
    it('navigates directly when no cid is given', async () => {
        const { result } = renderHook(() => useSearchNavigate());
        await result.current.goTo('/place/p1');

        expect(waitUntilVerified).not.toHaveBeenCalled();
        expect(switchCloud).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('/place/p1');
    });

    it('navigates directly when cid matches the active cloud', async () => {
        setSelection('c1');
        const { result } = renderHook(() => useSearchNavigate());
        await result.current.goTo('/place/p1', { cid: 'c1' });

        expect(waitUntilVerified).not.toHaveBeenCalled();
        expect(switchCloud).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('/place/p1');
    });

    it('waits for the handshake, switches cloud, then navigates when cid differs', async () => {
        setSelection('c1');
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
        navigate.mockImplementation(() => order.push('navigate'));

        const { result } = renderHook(() => useSearchNavigate());
        await result.current.goTo('/channels/ch1/room', { cid: 'c2', sid: 's2' });

        // The handshake is awaited twice: once before the cloud switch, once after it, because
        // switchSite rides the target cloud's freshly bound socket.
        expect(order).toEqual(['wait', 'cloud', 'wait', 'site', 'navigate']);
        expect(switchCloud).toHaveBeenCalledWith('c2');
        expect(switchSite).toHaveBeenCalledWith('s2');
    });

    it('switches the site without a cloud switch when only the place differs', async () => {
        setSelection('c1', 's1');
        const { result } = renderHook(() => useSearchNavigate());
        await result.current.goTo('/', { cid: 'c1', sid: 's2' });

        expect(waitUntilVerified).not.toHaveBeenCalled();
        expect(switchCloud).not.toHaveBeenCalled();
        expect(switchSite).toHaveBeenCalledWith('s2');
        expect(navigate).toHaveBeenCalledWith('/');
    });

    it('skips the site switch when the place is already active', async () => {
        setSelection('c1', 's1');
        const { result } = renderHook(() => useSearchNavigate());
        await result.current.goTo('/channels/ch1/room', { cid: 'c1', sid: 's1' });

        expect(switchSite).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('/channels/ch1/room');
    });

    it("switches the site after a cloud switch even when the sid matches the previous cloud's", async () => {
        // sid is only unique within a cloud, and the target cloud's session picks its own active
        // site — a matching string carries no information once the cloud changed.
        setSelection('c1', 's1');
        const { result } = renderHook(() => useSearchNavigate());
        await result.current.goTo('/channels/ch1/room', { cid: 'c2', sid: 's1' });

        expect(switchCloud).toHaveBeenCalledWith('c2');
        expect(switchSite).toHaveBeenCalledWith('s1');
    });

    it('stops without navigating when the place switch fails, and does not roll the cloud back', async () => {
        setSelection('c1', 's1');
        switchSite.mockRejectedValue(new Error('auth.switch failed'));

        const { result } = renderHook(() => useSearchNavigate());
        await result.current.goTo('/channels/ch1/room', { cid: 'c2', sid: 's2' });

        expect(switchCloud).toHaveBeenCalledWith('c2');
        expect(navigate).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith({ title: expect.any(String) });
    });

    it('does not switch the site when the post-switch handshake times out', async () => {
        setSelection('c1', 's1');
        waitUntilVerified.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

        const { result } = renderHook(() => useSearchNavigate());
        await result.current.goTo('/channels/ch1/room', { cid: 'c2', sid: 's2' });

        expect(switchCloud).toHaveBeenCalledWith('c2');
        expect(switchSite).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith({ title: expect.any(String) });
    });

    it('shows a failure toast and does not navigate when the handshake times out', async () => {
        setSelection('c1');
        waitUntilVerified.mockResolvedValue(false);

        const { result } = renderHook(() => useSearchNavigate());
        await result.current.goTo('/channels/ch1/room', { cid: 'c2' });

        expect(switchCloud).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith({ title: expect.any(String) });
    });

    it('shows a failure toast and does not navigate when the switch throws', async () => {
        setSelection('c1');
        switchCloud.mockRejectedValue(new Error('boom'));

        const { result } = renderHook(() => useSearchNavigate());
        await result.current.goTo('/channels/ch1/room', { cid: 'c2' });

        expect(navigate).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith({ title: expect.any(String) });
    });

    it('drops an overlapping call while one is already in flight', async () => {
        setSelection('c1');
        let release!: () => void;
        waitUntilVerified.mockImplementation(() => new Promise<boolean>(resolve => (release = () => resolve(true))));

        const { result } = renderHook(() => useSearchNavigate());
        const first = result.current.goTo('/a', { cid: 'c2' });
        const second = result.current.goTo('/b', { cid: 'c2' });

        await second;
        expect(switchCloud).not.toHaveBeenCalled();

        release();
        await first;
        expect(navigate).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledWith('/a');
    });
});
