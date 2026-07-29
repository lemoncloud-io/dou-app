import { renderHook } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';

import { getSocketManager } from '@chatic/app-runtime';
import { useSessionSelection, useSwitchCloudSession } from '@chatic/web-core';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useSearchNavigate } from './useSearchNavigate';

jest.mock('@chatic/app-runtime', () => ({ getSocketManager: jest.fn() }));
jest.mock('@chatic/web-core', () => ({
    useSessionSelection: jest.fn(),
    useSwitchCloudSession: jest.fn(),
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: jest.fn() }));
jest.mock('react-router-dom', () => ({ useNavigate: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));

const navigate = jest.fn();
const switchCloud = jest.fn();
const toast = jest.fn();
const waitUntilVerified = jest.fn();

const setSelection = (selectedCloudId: string | null) =>
    (useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId });

beforeEach(() => {
    jest.clearAllMocks();
    (useNavigate as jest.Mock).mockReturnValue(navigate);
    switchCloud.mockResolvedValue(undefined);
    (useSwitchCloudSession as jest.Mock).mockReturnValue({ switchCloud });
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
        navigate.mockImplementation(() => order.push('navigate'));

        const { result } = renderHook(() => useSearchNavigate());
        await result.current.goTo('/channels/ch1/room', { cid: 'c2' });

        expect(order).toEqual(['wait', 'cloud', 'navigate']);
        expect(switchCloud).toHaveBeenCalledWith('c2');
    });

    it('never switches the site', async () => {
        setSelection('c1');
        const { result } = renderHook(() => useSearchNavigate());
        await result.current.goTo('/channels/ch1/room', { cid: 'c2' });

        expect(navigate).toHaveBeenCalledWith('/channels/ch1/room');
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
