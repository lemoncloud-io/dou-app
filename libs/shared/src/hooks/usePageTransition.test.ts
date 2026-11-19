import { act, renderHook } from '@testing-library/react';

import { useNavigateWithTransition } from './usePageTransition';

const navigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

// The package's executor, reduced to what this hook relies on: it runs the update callback once and
// returns a promise of its own. `transitionResult` is that promise, set per test.
let transitionResult: Promise<void> = Promise.resolve();
let viewTransitionSupported = true;
const executePageTransition = jest.fn((update: () => Promise<void> | void, _options?: unknown) => {
    void update();
    return transitionResult;
});
jest.mock('@lemoncloud/page-transition-core', () => ({
    executePageTransition: (update: () => Promise<void> | void, options?: unknown) =>
        executePageTransition(update, options),
    isViewTransitionSupported: () => viewTransitionSupported,
}));

const landed = Promise.resolve();
const waitForDestination = jest.fn((_options: { traversal: boolean }) => landed);
jest.mock('./waitForDestination', () => ({
    waitForDestination: (options: { traversal: boolean }) => waitForDestination(options),
}));

let mockPlatform = 'ios';
jest.mock('@chatic/bridges', () => ({
    hostProfile: () => ({ globals: { CHATIC_APP_PLATFORM: mockPlatform } }),
}));

const deferred = () => {
    let resolve!: () => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

// Spelled out rather than imported: web-ui-kit's HeaderGlass reads this exact name and its tests pin
// the same literal, so renaming it on one side breaks a test instead of silently ending the hold.
const ATTRIBUTE = 'data-page-transition';
const marked = () => document.documentElement.hasAttribute(ATTRIBUTE);

describe('useNavigateWithTransition', () => {
    afterEach(() => {
        jest.clearAllMocks();
        navigate.mockReset();
        transitionResult = Promise.resolve();
        viewTransitionSupported = true;
        mockPlatform = 'ios';
        document.documentElement.removeAttribute(ATTRIBUTE);
    });

    describe('the transition', () => {
        it('holds the capture until the destination has rendered, armed before navigating', () => {
            const order: string[] = [];
            waitForDestination.mockImplementationOnce(() => {
                order.push('wait');
                return landed;
            });
            navigate.mockImplementationOnce(() => order.push('navigate'));
            let update: (() => Promise<void> | void) | undefined;
            executePageTransition.mockImplementationOnce(fn => {
                update = fn;
                return transitionResult;
            });
            const { result } = renderHook(() => useNavigateWithTransition());

            act(() => {
                void result.current('/channels/c1/room');
            });

            // The update callback's promise is what the browser waits on before capturing.
            expect(update?.()).toBe(landed);
            expect(order).toEqual(['wait', 'navigate']);
            expect(waitForDestination).toHaveBeenCalledWith({ traversal: false });
            expect(navigate).toHaveBeenCalledWith('/channels/c1/room', {});
        });

        it('treats a history delta as a traversal and plays it backwards', () => {
            const { result } = renderHook(() => useNavigateWithTransition());

            act(() => {
                void result.current(-1);
            });

            expect(waitForDestination).toHaveBeenCalledWith({ traversal: true });
            expect(navigate).toHaveBeenCalledWith(-1);
            expect(executePageTransition).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({ direction: 'back', config: { platform: 'ios' } })
            );
        });

        it('plays a push forward on the platform the shell named, and keeps an explicit direction', async () => {
            mockPlatform = 'android';
            const { result } = renderHook(() => useNavigateWithTransition());

            await act(async () => {
                await result.current('/a');
            });
            await act(async () => {
                await result.current('/', { replace: true, transition: true, direction: 'back' });
            });

            expect(executePageTransition).toHaveBeenNthCalledWith(
                1,
                expect.any(Function),
                expect.objectContaining({ direction: 'forward', config: { platform: 'android' } })
            );
            expect(executePageTransition).toHaveBeenNthCalledWith(
                2,
                expect.any(Function),
                expect.objectContaining({ direction: 'back' })
            );
            // The transition options are this hook's; the router only sees its own.
            expect(navigate).toHaveBeenLastCalledWith('/', { replace: true });
        });

        it('lets the engine pick the animation where the shell named no platform', () => {
            mockPlatform = '';
            const { result } = renderHook(() => useNavigateWithTransition());

            act(() => {
                void result.current('/a');
            });

            expect(executePageTransition).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({ config: { platform: 'auto' } })
            );
        });

        it('switches without a transition on replace, as the tab bar does', async () => {
            const { result } = renderHook(() => useNavigateWithTransition());

            await act(async () => {
                await result.current('/mypage', { replace: true });
            });

            expect(navigate).toHaveBeenCalledWith('/mypage', { replace: true });
            expect(executePageTransition).not.toHaveBeenCalled();
            expect(waitForDestination).not.toHaveBeenCalled();
            expect(marked()).toBe(false);
        });

        it('switches without waiting when the caller asked for no animation', async () => {
            const { result } = renderHook(() => useNavigateWithTransition());

            await act(async () => {
                await result.current('/a', { animation: 'none' });
            });

            expect(navigate).toHaveBeenCalledWith('/a', {});
            expect(executePageTransition).not.toHaveBeenCalled();
            expect(waitForDestination).not.toHaveBeenCalled();
        });

        // The package clears every class it set when a transition finishes, a newer running one's
        // included, so a second transition started inside the first would lose its animation midway.
        it('navigates without a second transition while one is running, after the first has navigated', async () => {
            const first = deferred();
            const order: string[] = [];
            let update: (() => Promise<void> | void) | undefined;
            executePageTransition.mockImplementationOnce(fn => {
                update = fn;
                return first.promise;
            });
            navigate.mockImplementation((to: unknown) => order.push(String(to)));
            const { result } = renderHook(() => useNavigateWithTransition());

            let secondDone: Promise<void> | undefined;
            act(() => {
                void result.current(-1);
                secondDone = result.current(-1);
            });
            await act(async () => {
                await Promise.resolve();
            });
            // The browser has not run the first update yet, so the second must not overtake it.
            expect(order).toEqual([]);

            await act(async () => {
                await update?.();
                await secondDone;
            });
            expect(executePageTransition).toHaveBeenCalledTimes(1);
            expect(order).toEqual(['-1', '-1']);

            // Once the first has finished, the next navigation animates again.
            await act(async () => {
                first.resolve();
                await first.promise;
            });
            await act(async () => {
                await result.current('/b');
            });
            expect(executePageTransition).toHaveBeenCalledTimes(2);
        });

        it('recovers when navigating fails inside the transition, so later navigations still animate', async () => {
            executePageTransition.mockImplementationOnce(fn => {
                try {
                    void fn();
                } catch {
                    return Promise.reject(new Error('update callback threw'));
                }
                return transitionResult;
            });
            navigate.mockImplementationOnce(() => {
                throw new Error('history push failed');
            });
            const { result } = renderHook(() => useNavigateWithTransition());

            await act(async () => {
                await result.current('/a').catch(() => undefined);
            });
            expect(marked()).toBe(false);

            await act(async () => {
                await result.current('/b');
            });
            expect(executePageTransition).toHaveBeenCalledTimes(2);
        });

        it('navigates directly where the engine has no view transitions', async () => {
            viewTransitionSupported = false;
            const { result } = renderHook(() => useNavigateWithTransition());

            await act(async () => {
                await result.current(-1);
            });

            expect(navigate).toHaveBeenCalledWith(-1);
            expect(executePageTransition).not.toHaveBeenCalled();
        });
    });

    describe('the document mark', () => {
        it('marks the document while the transition runs and clears it once the transition is over', async () => {
            const transition = deferred();
            transitionResult = transition.promise;
            const { result } = renderHook(() => useNavigateWithTransition());

            let done: Promise<void> | undefined;
            act(() => {
                done = result.current('/channels/c1/room');
            });
            // A header mounting inside the transition reads this to hold its opaque pane.
            expect(marked()).toBe(true);

            await act(async () => {
                transition.resolve();
                await done;
            });
            expect(marked()).toBe(false);
        });

        it('keeps the mark until the running transition has settled, even when a navigation joins it', async () => {
            const first = deferred();
            transitionResult = first.promise;
            const { result } = renderHook(() => useNavigateWithTransition());

            let firstDone: Promise<void> | undefined;
            let secondDone: Promise<void> | undefined;
            act(() => {
                firstDone = result.current('/a');
                secondDone = result.current('/b');
            });

            // The second navigation goes through without a transition of its own and settles early.
            await act(async () => {
                await secondDone;
            });
            expect(marked()).toBe(true);

            await act(async () => {
                first.resolve();
                await firstDone;
            });
            expect(marked()).toBe(false);
        });

        it('clears the mark when the transition fails, so nothing is left holding on it', async () => {
            const transition = deferred();
            transitionResult = transition.promise;
            const { result } = renderHook(() => useNavigateWithTransition());

            let done: Promise<void> | undefined;
            act(() => {
                done = result.current(-1);
            });
            await act(async () => {
                transition.reject(new Error('transition skipped'));
                await done?.catch(() => undefined);
            });

            expect(marked()).toBe(false);
        });

        it('clears the mark and rethrows when the navigation throws before returning', () => {
            viewTransitionSupported = false;
            navigate.mockImplementation(() => {
                throw new Error('history push failed');
            });
            const { result } = renderHook(() => useNavigateWithTransition());

            expect(() => result.current('/a')).toThrow('history push failed');
            expect(marked()).toBe(false);
        });

        it('does not mark the document on Android, whose WebView paints the frost inside the transition', async () => {
            mockPlatform = 'android';
            const transition = deferred();
            transitionResult = transition.promise;
            const { result } = renderHook(() => useNavigateWithTransition());

            let done: Promise<void> | undefined;
            act(() => {
                done = result.current('/channels/c1/room');
            });
            expect(marked()).toBe(false);

            await act(async () => {
                transition.resolve();
                await done;
            });
            expect(marked()).toBe(false);
        });
    });
});
