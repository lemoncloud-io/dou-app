import { act, renderHook, waitFor } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { useEnsureCloudSession } from './useEnsureCloudSession';

jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionSelection: jest.fn(),
            useRuntimeProfile: jest.fn(),
            useSwitchCloudSession: jest.fn(),
        },
    },
}));

const switchCloud = jest.fn();

const setup = (opts: { selectedCloudId?: string; isCloudActive?: boolean; isPending?: boolean } = {}) => {
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({
        selectedCloudId: opts.selectedCloudId ?? 'default',
    });
    (runtime.session.useRuntimeProfile as jest.Mock).mockReturnValue({ isCloudActive: opts.isCloudActive ?? false });
    (runtime.session.useSwitchCloudSession as jest.Mock).mockReturnValue({
        switchCloud,
        isPending: opts.isPending ?? false,
    });
};

beforeEach(() => {
    jest.clearAllMocks();
    switchCloud.mockResolvedValue(undefined);
});

describe('useEnsureCloudSession', () => {
    it('is ready at once when the cloud is already the live session, and does not switch', () => {
        setup({ selectedCloudId: 'CL1', isCloudActive: true });

        const { result } = renderHook(() => useEnsureCloudSession('CL1'));

        expect(result.current.isReady).toBe(true);
        expect(result.current.isSwitching).toBe(false);
        expect(switchCloud).not.toHaveBeenCalled();
    });

    it('switches into the cloud when another one (or the relay) is active', () => {
        setup({ selectedCloudId: 'default' });

        const { result } = renderHook(() => useEnsureCloudSession('CL1'));

        expect(switchCloud).toHaveBeenCalledWith('CL1');
        expect(result.current.isReady).toBe(false);
        expect(result.current.isSwitching).toBe(true);
    });

    it('reads ready once the session commits to the cloud it switched into', () => {
        setup({ selectedCloudId: 'default' });
        const { result, rerender } = renderHook(() => useEnsureCloudSession('CL1'));
        expect(result.current.isSwitching).toBe(true);

        // The switch committed: the selection names the cloud and the session is live.
        setup({ selectedCloudId: 'CL1', isCloudActive: true });
        rerender();

        expect(result.current.isReady).toBe(true);
        expect(result.current.isSwitching).toBe(false);
        expect(switchCloud).toHaveBeenCalledTimes(1);
    });

    it('waits for a switch already in flight instead of starting a second one', () => {
        setup({ selectedCloudId: 'default', isPending: true });
        const { result, rerender } = renderHook(() => useEnsureCloudSession('CL1'));

        expect(switchCloud).not.toHaveBeenCalled();
        expect(result.current.isSwitching).toBe(true);

        // It settled on another cloud: now this one asks for its own switch.
        setup({ selectedCloudId: 'CL9', isCloudActive: true, isPending: false });
        rerender();

        expect(switchCloud).toHaveBeenCalledWith('CL1');
    });

    it('switches once per cloud, even while the selection has not committed yet', () => {
        // Selected but not yet active: the window in which a naive effect would fire again.
        setup({ selectedCloudId: 'CL1', isCloudActive: false });

        const { rerender } = renderHook(() => useEnsureCloudSession('CL1'));
        rerender();
        rerender();

        expect(switchCloud).toHaveBeenCalledTimes(1);
    });

    it('reports a failed switch and tries again only on retry', async () => {
        const boom = new Error('switch boom');
        switchCloud.mockRejectedValueOnce(boom);
        setup({ selectedCloudId: 'default' });

        const { result } = renderHook(() => useEnsureCloudSession('CL1'));

        await waitFor(() => expect(result.current.error).toBe(boom));
        expect(result.current.isSwitching).toBe(false);
        expect(switchCloud).toHaveBeenCalledTimes(1);

        act(() => result.current.retry());

        await waitFor(() => expect(switchCloud).toHaveBeenCalledTimes(2));
    });

    it('does nothing without a cloud id', () => {
        setup();

        const { result } = renderHook(() => useEnsureCloudSession(undefined));

        expect(switchCloud).not.toHaveBeenCalled();
        expect(result.current.isReady).toBe(false);
        expect(result.current.isSwitching).toBe(false);
    });
});
