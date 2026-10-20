import { createElement, type ReactNode } from 'react';

import { MutationObserver, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

const navigate = jest.fn();
const startDmRequest = jest.fn();
const logError = jest.fn();
const logWarn = jest.fn();
const toast = jest.fn();
const requestBackgroundRefresh = jest.fn(() => Promise.resolve());

const SWITCH_SITE_KEY = ['session', 'switch-site'];
const SWITCH_CLOUD_KEY = ['session', 'switch-cloud'];

/** What the latest render reads from `useSessionSelection`. */
let mockSelection: { selectedCloudId: string | null; selectedSiteId: string | null } = {
    selectedCloudId: 'cloud-a',
    selectedSiteId: 'p1',
};
/** What the session holds right now, read outside a render by `getGlobalSessionContext`. */
let mockLive: { cloudId: string | null; siteId: string | null } = { cloudId: 'cloud-a', siteId: 'p1' };

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/bridges', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: (...args: unknown[]) => logWarn(...args),
        error: (...args: unknown[]) => logError(...args),
    },
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (...args: unknown[]) => toast(...args) }));
jest.mock('../../../runtime/backgroundRefresh', () => ({
    requestBackgroundRefresh: () => requestBackgroundRefresh(),
}));
// One object, not a fresh one per render: the hook lists the repository in a dependency array.
const repositories = { channel: { startDm: (...args: unknown[]) => startDmRequest(...args) } };
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => repositories },
        session: {
            SWITCH_SITE_MUTATION_KEY: ['session', 'switch-site'],
            SWITCH_CLOUD_MUTATION_KEY: ['session', 'switch-cloud'],
            useSessionSelection: () => mockSelection,
            getGlobalSessionContext: () => ({ cloud: { ...mockLive } }),
        },
    },
}));

import { useStartDm } from './useStartDm';

let queryClient: QueryClient;

const setup = () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);
    return renderHook(() => useStartDm(), { wrapper });
};

/**
 * Starts a real pending mutation under a switch key, the way the session's switch does, and hands
 * back the way to settle it.
 */
const startSwitch = (mutationKey: string[]) => {
    let finish: () => void = () => undefined;
    let fail: (error: Error) => void = () => undefined;
    const done = new Promise<void>((resolve, reject) => {
        finish = resolve;
        fail = reject;
    });
    const observer = new MutationObserver(queryClient, { mutationKey, mutationFn: () => done });
    const settled = observer.mutate().catch(() => undefined);
    return {
        succeed: async () => {
            finish();
            await settled;
        },
        fail: async () => {
            fail(new Error('switch failed'));
            await settled;
        },
    };
};

/** Lets pending promise chains run without settling anything the test holds. */
const flush = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));

beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    mockSelection = { selectedCloudId: 'cloud-a', selectedSiteId: 'p1' };
    mockLive = { cloudId: 'cloud-a', siteId: 'p1' };
    startDmRequest.mockResolvedValue({ id: 'dm-1', sid: 'p1', stereo: 'dm' });
});

afterEach(() => {
    queryClient.clear();
});

describe('useStartDm — opening the room', () => {
    it('sends the peer id, navigates into the room and resolves to it', async () => {
        const { result } = setup();

        const room = await act(async () => result.current.startDm('u2'));

        expect(startDmRequest).toHaveBeenCalledWith({ peerId: 'u2' });
        expect(navigate).toHaveBeenCalledWith('/channels/dm-1/room', { replace: false });
        expect(room).toMatchObject({ id: 'dm-1' });
        expect(result.current.isStarting).toBe(false);
    });

    // A room that names no place is not written to the cache, so home only lists it after the next
    // channel sync; the hook asks for that sync instead of waiting for the poll.
    it('asks for a background refresh when the room names no place', async () => {
        startDmRequest.mockResolvedValue({ id: 'dm-1', sid: '' });
        const { result } = setup();

        await act(async () => {
            await result.current.startDm('u2');
        });

        expect(requestBackgroundRefresh).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledWith('/channels/dm-1/room', { replace: false });
    });

    it('does not ask for a background refresh when the room names its place', async () => {
        const { result } = setup();

        await act(async () => {
            await result.current.startDm('u2');
        });

        expect(requestBackgroundRefresh).not.toHaveBeenCalled();
    });

    it('logs a warning but still opens a room filed under another place', async () => {
        startDmRequest.mockResolvedValue({ id: 'dm-1', sid: 'p9' });
        const { result } = setup();

        await act(async () => {
            await result.current.startDm('u2');
        });

        expect(logWarn).toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('/channels/dm-1/room', { replace: false });
    });

    it('can open another room once the previous attempt has finished', async () => {
        const { result } = setup();

        await act(async () => {
            await result.current.startDm('u2');
        });
        await act(async () => {
            await result.current.startDm('u3');
        });

        expect(startDmRequest).toHaveBeenCalledTimes(2);
    });

    // The picker replaces itself with the room, so back from the room returns home, not to the picker.
    it('forwards the replace option to the navigation', async () => {
        const { result } = setup();

        await act(async () => {
            await result.current.startDm('u2', { replace: true });
        });

        expect(navigate).toHaveBeenCalledWith('/channels/dm-1/room', { replace: true });
    });

    // The request is already out, so the room is still made and home lists it; but a screen the person
    // already left must not pull them into the room from wherever they went.
    it('still resolves to the room but does not navigate when unmounted before the room came back', async () => {
        let answer: (room: unknown) => void = () => undefined;
        startDmRequest.mockImplementation(
            () =>
                new Promise(resolve => {
                    answer = resolve;
                })
        );
        const { result, unmount } = setup();

        let pending!: Promise<unknown>;
        act(() => {
            pending = result.current.startDm('u2');
        });
        await flush();
        expect(startDmRequest).toHaveBeenCalledTimes(1);

        unmount();
        answer({ id: 'dm-1', sid: 'p1' });

        await expect(pending).resolves.toMatchObject({ id: 'dm-1' });
        expect(navigate).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
    });
});

describe('useStartDm — failures', () => {
    it('returns null, stays put, logs and toasts when the request fails', async () => {
        startDmRequest.mockRejectedValue(new Error('nope'));
        const { result } = setup();

        const room = await act(async () => result.current.startDm('u2'));

        expect(room).toBeNull();
        expect(navigate).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith('CHANNEL', '[useStartDm] start failed', expect.anything());
        expect(toast).toHaveBeenCalledWith({ variant: 'destructive', title: 'cloudDm.picker.failed' });
        expect(result.current.isStarting).toBe(false);
    });

    // `/channels/undefined/room` is a real route that renders a broken room, so an id-less answer
    // has to take the failure path rather than become a navigation.
    it('treats a room without an id as a failure', async () => {
        startDmRequest.mockResolvedValue({ sid: 'p1' });
        const { result } = setup();

        const room = await act(async () => result.current.startDm('u2'));

        expect(room).toBeNull();
        expect(navigate).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalled();
        expect(toast).toHaveBeenCalledTimes(1);
    });
});

describe('useStartDm — guards', () => {
    // The guard is a ref precisely for this: both taps land before a re-render, so a state flag
    // would still be false on the second one.
    it('sends one request when called twice while the first is in flight', async () => {
        const { result } = setup();

        let second: unknown;
        await act(async () => {
            const [, b] = await Promise.all([result.current.startDm('u2'), result.current.startDm('u2')]);
            second = b;
        });

        expect(startDmRequest).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledTimes(1);
        expect(second).toBeNull();
        expect(toast).not.toHaveBeenCalled();
    });

    it('sends nothing for an empty peer id', async () => {
        const { result } = setup();

        const room = await act(async () => result.current.startDm(''));

        expect(room).toBeNull();
        expect(startDmRequest).not.toHaveBeenCalled();
    });

    it.each([
        ['on the relay cloud', { selectedCloudId: 'default', selectedSiteId: 'p1' }],
        ['with no place selected', { selectedCloudId: 'cloud-a', selectedSiteId: null }],
        ['with no cloud selected', { selectedCloudId: null, selectedSiteId: 'p1' }],
    ])('is unavailable and sends nothing %s', async (_label, selection) => {
        mockSelection = selection;
        const { result } = setup();

        expect(result.current.isAvailable).toBe(false);
        const room = await act(async () => result.current.startDm('u2'));

        expect(room).toBeNull();
        expect(startDmRequest).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
    });

    it('is available in a subscription cloud with a place selected', () => {
        const { result } = setup();

        expect(result.current.isAvailable).toBe(true);
    });
});

describe('useStartDm — a running place or cloud switch', () => {
    // Sent before the switch settles, the request would reach a session still on the place being
    // left, and the room would be filed there for good.
    it('waits for a running place switch to settle, then sends', async () => {
        // The render already names the place being switched to.
        mockSelection = { selectedCloudId: 'cloud-a', selectedSiteId: 'p2' };
        mockLive = { cloudId: 'cloud-a', siteId: 'p2' };
        startDmRequest.mockResolvedValue({ id: 'dm-2', sid: 'p2' });
        const { result } = setup();
        const sw = startSwitch(SWITCH_SITE_KEY);
        expect(queryClient.isMutating({ mutationKey: SWITCH_SITE_KEY })).toBe(1);

        let pending!: Promise<unknown>;
        act(() => {
            pending = result.current.startDm('u2');
        });
        await flush();

        expect(startDmRequest).not.toHaveBeenCalled();
        expect(result.current.isStarting).toBe(true);

        await act(async () => {
            await sw.succeed();
        });
        const room = await act(async () => pending);

        expect(startDmRequest).toHaveBeenCalledWith({ peerId: 'u2' });
        expect(navigate).toHaveBeenCalledWith('/channels/dm-2/room', { replace: false });
        expect(room).toMatchObject({ id: 'dm-2' });
    });

    it('waits for a running cloud switch the same way', async () => {
        const { result } = setup();
        const sw = startSwitch(SWITCH_CLOUD_KEY);

        let pending!: Promise<unknown>;
        act(() => {
            pending = result.current.startDm('u2');
        });
        await flush();
        expect(startDmRequest).not.toHaveBeenCalled();

        await act(async () => {
            await sw.succeed();
        });
        await act(async () => pending);

        expect(startDmRequest).toHaveBeenCalledTimes(1);
    });

    // A failed switch rolls the place back inside its own mutation: the place the person asked from
    // is gone, so nothing is sent and nothing is said.
    it('sends nothing and returns null when the switch ends on a different place', async () => {
        mockSelection = { selectedCloudId: 'cloud-a', selectedSiteId: 'p2' };
        mockLive = { cloudId: 'cloud-a', siteId: 'p2' };
        const { result } = setup();
        const sw = startSwitch(SWITCH_SITE_KEY);

        let pending!: Promise<unknown>;
        act(() => {
            pending = result.current.startDm('u2');
        });
        await flush();

        // The switch fails and rolls the session back before React renders the rollback.
        mockLive = { cloudId: 'cloud-a', siteId: 'p1' };
        await act(async () => {
            await sw.fail();
        });
        const room = await act(async () => pending);

        expect(room).toBeNull();
        expect(startDmRequest).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
        expect(logError).not.toHaveBeenCalled();
        await waitFor(() => expect(result.current.isStarting).toBe(false));
    });

    it('sends nothing when the switch ends in a different cloud', async () => {
        const { result } = setup();
        const sw = startSwitch(SWITCH_CLOUD_KEY);

        let pending!: Promise<unknown>;
        act(() => {
            pending = result.current.startDm('u2');
        });
        await flush();

        mockLive = { cloudId: 'cloud-b', siteId: 'p1' };
        await act(async () => {
            await sw.succeed();
        });
        const room = await act(async () => pending);

        expect(room).toBeNull();
        expect(startDmRequest).not.toHaveBeenCalled();
    });

    // A cloud switch while the request was in flight leaves the room in the cloud that was left.
    it('does not navigate when the cloud moved while the request was in flight', async () => {
        startDmRequest.mockImplementation(async () => {
            mockLive = { cloudId: 'cloud-b', siteId: 'p7' };
            return { id: 'dm-1', sid: 'p1' };
        });
        const { result } = setup();

        const room = await act(async () => result.current.startDm('u2'));

        expect(startDmRequest).toHaveBeenCalledTimes(1);
        expect(room).toBeNull();
        expect(navigate).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
    });

    it('treats a second call while waiting on a switch as a double tap', async () => {
        const { result } = setup();
        const sw = startSwitch(SWITCH_SITE_KEY);

        let first!: Promise<unknown>;
        let second!: Promise<unknown>;
        act(() => {
            first = result.current.startDm('u2');
            second = result.current.startDm('u2');
        });
        await expect(second).resolves.toBeNull();

        await act(async () => {
            await sw.succeed();
        });
        await act(async () => first);

        expect(startDmRequest).toHaveBeenCalledTimes(1);
    });
});
