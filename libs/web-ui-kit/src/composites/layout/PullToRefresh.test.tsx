import { act, fireEvent, render, screen } from '@testing-library/react';

import {
    PULL_TO_REFRESH_STEPS,
    PULL_TO_REFRESH_THRESHOLD,
    PullToRefresh,
    resolvePullDistance,
    resolvePullStep,
} from './PullToRefresh';

/** Finger travel that clears the threshold once resistance halves it. */
const PAST_THRESHOLD = PULL_TO_REFRESH_THRESHOLD * 2 + 10;
/** Finger travel for one step of the gauge, after resistance halves it. */
const STEP_TRAVEL = (PULL_TO_REFRESH_THRESHOLD / PULL_TO_REFRESH_STEPS) * 2;

const renderList = (onRefresh: () => Promise<unknown>, props: { disabled?: boolean } = {}) => {
    render(
        <PullToRefresh data-testid="list" onRefresh={onRefresh} refreshingLabel="Refreshing now" {...props}>
            <p>row</p>
        </PullToRefresh>
    );
    return screen.getByTestId('list');
};

const touch = (clientY: number, clientX = 0, identifier = 1) => ({ touches: [{ identifier, clientX, clientY }] });

/** One finger down at y=0, dragged to `toY`, then lifted. */
const pull = (node: HTMLElement, toY: number, toX = 0) => {
    fireEvent.touchStart(node, touch(0));
    fireEvent.touchMove(node, touch(toY, toX));
    fireEvent.touchEnd(node, { touches: [] });
};

/** A promise the test resolves by hand, to hold a refresh open. */
const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>(res => (resolve = res));
    return { promise, resolve };
};

describe('resolvePullDistance', () => {
    it('halves downward finger travel', () => {
        expect(resolvePullDistance(40)).toBe(20);
    });

    it('treats upward travel as no pull', () => {
        expect(resolvePullDistance(-30)).toBe(0);
    });

    it('caps the distance however far the finger goes', () => {
        expect(resolvePullDistance(10_000)).toBe(120);
    });
});

describe('resolvePullStep', () => {
    it('reads no step at rest', () => {
        expect(resolvePullStep(0)).toBe(0);
    });

    it('reads half the steps at half the threshold', () => {
        expect(resolvePullStep(PULL_TO_REFRESH_THRESHOLD / 2)).toBe(PULL_TO_REFRESH_STEPS / 2);
    });

    it('reads the last step at the threshold and stays there past it', () => {
        expect(resolvePullStep(PULL_TO_REFRESH_THRESHOLD)).toBe(PULL_TO_REFRESH_STEPS);
        expect(resolvePullStep(PULL_TO_REFRESH_THRESHOLD * 3)).toBe(PULL_TO_REFRESH_STEPS);
    });
});

describe('PullToRefresh', () => {
    it('refreshes on a pull from the top that goes past the threshold', async () => {
        const onRefresh = jest.fn().mockResolvedValue(undefined);
        const node = renderList(onRefresh);

        await act(async () => pull(node, PAST_THRESHOLD));

        expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('refreshes as soon as the gauge fills, before the finger lifts', async () => {
        const onRefresh = jest.fn(() => new Promise(() => undefined));
        const node = renderList(onRefresh);

        await act(async () => {
            fireEvent.touchStart(node, touch(0));
            fireEvent.touchMove(node, touch(PAST_THRESHOLD));
        });

        expect(onRefresh).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('status', { name: 'Refreshing now' })).toBeInTheDocument();
    });

    it('does not refresh when released short of the threshold', async () => {
        const onRefresh = jest.fn().mockResolvedValue(undefined);
        const node = renderList(onRefresh);

        await act(async () => pull(node, PULL_TO_REFRESH_THRESHOLD));

        expect(onRefresh).not.toHaveBeenCalled();
    });

    it('does not start a pull when the list is scrolled down', async () => {
        const onRefresh = jest.fn().mockResolvedValue(undefined);
        const node = renderList(onRefresh);
        node.scrollTop = 200;

        await act(async () => pull(node, PAST_THRESHOLD));

        expect(onRefresh).not.toHaveBeenCalled();
    });

    it('ignores a mostly sideways drag', async () => {
        const onRefresh = jest.fn().mockResolvedValue(undefined);
        const node = renderList(onRefresh);

        await act(async () => pull(node, PAST_THRESHOLD, PAST_THRESHOLD * 2));

        expect(onRefresh).not.toHaveBeenCalled();
    });

    it('drops a pull the system cancels before the gauge fills', async () => {
        const onRefresh = jest.fn().mockResolvedValue(undefined);
        const node = renderList(onRefresh);

        await act(async () => {
            fireEvent.touchStart(node, touch(0));
            fireEvent.touchMove(node, touch(PULL_TO_REFRESH_THRESHOLD));
            fireEvent.touchCancel(node, { touches: [] });
        });

        expect(onRefresh).not.toHaveBeenCalled();
        expect(node.lastElementChild).not.toHaveAttribute('style');
    });

    it('keeps a refresh the gauge already started when the system cancels the touch', async () => {
        const onRefresh = jest.fn(() => new Promise(() => undefined));
        const node = renderList(onRefresh);

        await act(async () => {
            fireEvent.touchStart(node, touch(0));
            fireEvent.touchMove(node, touch(PAST_THRESHOLD));
            fireEvent.touchCancel(node, { touches: [] });
        });

        expect(onRefresh).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('status')).toBeInTheDocument();
        // Settled into the indicator's slot rather than left under a finger that is gone.
        expect(node.lastElementChild).toHaveStyle({ transform: 'translateY(64px)' });
    });

    it('cancels the native move while pulling, so the WebView does not scroll underneath', () => {
        const node = renderList(jest.fn().mockResolvedValue(undefined));

        fireEvent.touchStart(node, touch(0));
        // Short of the fill, so the move does not also start a refresh that settles after the test.
        const notCancelled = fireEvent.touchMove(node, touch(PULL_TO_REFRESH_THRESHOLD));

        expect(notCancelled).toBe(false);
    });

    it('holds the refreshing status until the refresh settles, then clears it', async () => {
        const pending = deferred();
        const node = renderList(() => pending.promise);

        await act(async () => pull(node, PAST_THRESHOLD));
        expect(screen.getByRole('status', { name: 'Refreshing now' })).toBeInTheDocument();

        await act(async () => pending.resolve());
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('ignores a second pull while a refresh is still running', async () => {
        const pending = deferred();
        const onRefresh = jest.fn(() => pending.promise);
        const node = renderList(onRefresh);

        await act(async () => pull(node, PAST_THRESHOLD));
        await act(async () => pull(node, PAST_THRESHOLD));

        expect(onRefresh).toHaveBeenCalledTimes(1);
        await act(async () => pending.resolve());
    });

    it('clears the status even when the refresh rejects', async () => {
        const node = renderList(() => Promise.reject(new Error('offline')));

        await act(async () => pull(node, PAST_THRESHOLD));

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('does nothing when disabled', async () => {
        const onRefresh = jest.fn().mockResolvedValue(undefined);
        const node = renderList(onRefresh, { disabled: true });

        await act(async () => pull(node, PAST_THRESHOLD));

        expect(onRefresh).not.toHaveBeenCalled();
    });

    it('takes an opening jitter that says nothing as undecided, not as a scroll', async () => {
        const onRefresh = jest.fn().mockResolvedValue(undefined);
        const node = renderList(onRefresh);

        await act(async () => {
            fireEvent.touchStart(node, touch(0));
            // iOS delivers one-pixel moves: the first can be flat, or a sideways twitch.
            fireEvent.touchMove(node, touch(0, 1));
            fireEvent.touchMove(node, touch(2, 1));
            fireEvent.touchMove(node, touch(PAST_THRESHOLD));
            fireEvent.touchEnd(node, { touches: [] });
        });

        expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('holds back a downward move still inside the slop, so the WebView cannot claim the touch', () => {
        const node = renderList(jest.fn().mockResolvedValue(undefined));

        fireEvent.touchStart(node, touch(0));
        const notCancelled = fireEvent.touchMove(node, touch(2));

        expect(notCancelled).toBe(false);
    });

    it('still puts the list back when the element under the finger is removed mid-drag', async () => {
        const onRefresh = jest.fn().mockResolvedValue(undefined);
        // Different element types, so React really removes the skeleton instead of reusing it.
        const List = ({ loading }: { loading: boolean }) => (
            <PullToRefresh data-testid="list" onRefresh={onRefresh}>
                {loading ? <div data-testid="skeleton">skeleton</div> : <p>row</p>}
            </PullToRefresh>
        );
        const { rerender } = render(<List loading />);
        const skeleton = screen.getByTestId('skeleton');

        fireEvent.touchStart(skeleton, touch(0));
        // Short of the fill, so only the release can put the list back.
        fireEvent.touchMove(skeleton, touch(PULL_TO_REFRESH_THRESHOLD));
        // The host swaps the skeleton for real rows. The finger's events keep targeting the node,
        // which is now detached and bubbles to nobody.
        rerender(<List loading={false} />);
        expect(skeleton.isConnected).toBe(false);
        await act(async () => {
            fireEvent.touchEnd(skeleton, { touches: [] });
        });

        expect(onRefresh).not.toHaveBeenCalled();
        expect((screen.getByTestId('list').lastElementChild as HTMLElement).style.transform).toBe('');
    });

    it('drops the pull when a second finger lands before the gauge fills', async () => {
        const onRefresh = jest.fn().mockResolvedValue(undefined);
        const node = renderList(onRefresh);

        await act(async () => {
            fireEvent.touchStart(node, touch(0));
            fireEvent.touchMove(node, touch(PULL_TO_REFRESH_THRESHOLD));
            fireEvent.touchStart(node, {
                touches: [
                    { identifier: 1, clientX: 0, clientY: PULL_TO_REFRESH_THRESHOLD },
                    { identifier: 2, clientX: 50, clientY: 10 },
                ],
            });
            fireEvent.touchEnd(node, { touches: [] });
        });

        expect(onRefresh).not.toHaveBeenCalled();
        expect(node.lastElementChild).not.toHaveAttribute('style');
    });

    it('stops waiting on a refresh that never answers once maxRefreshMs passes', async () => {
        jest.useFakeTimers();
        render(
            <PullToRefresh data-testid="list" onRefresh={() => new Promise(() => undefined)} maxRefreshMs={1000}>
                row
            </PullToRefresh>
        );
        const node = screen.getByTestId('list');

        await act(async () => pull(node, PAST_THRESHOLD));
        expect(screen.getByRole('status')).toBeInTheDocument();

        await act(async () => {
            jest.advanceTimersByTime(1000);
        });
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        jest.useRealTimers();
    });

    /** Renders a list whose refresh never answers, so a test can follow one touch past the fill. */
    const renderGauge = () => {
        const onTick = jest.fn();
        const onFill = jest.fn();
        const onRefresh = jest.fn(() => new Promise(() => undefined));
        render(
            <PullToRefresh data-testid="list" onRefresh={onRefresh} onTick={onTick} onFill={onFill}>
                row
            </PullToRefresh>
        );
        const node = screen.getByTestId('list');
        const moveTo = (steps: number) => fireEvent.touchMove(node, touch(steps * STEP_TRAVEL));
        return { node, moveTo, onTick, onFill, onRefresh };
    };

    it('ticks once per step on the way down, then fills once and starts the refresh', async () => {
        const { node, moveTo, onTick, onFill, onRefresh } = renderGauge();

        // Async: the refresh is called a microtask after the fill.
        await act(async () => {
            fireEvent.touchStart(node, touch(0));
            for (let step = 1; step <= PULL_TO_REFRESH_STEPS; step += 1) moveTo(step);
        });

        expect(onTick).toHaveBeenCalledTimes(PULL_TO_REFRESH_STEPS - 1);
        expect(onFill).toHaveBeenCalledTimes(1);
        expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('ticks again for steps refilled after pulling back, like a ratchet', () => {
        const { node, moveTo, onTick, onFill } = renderGauge();

        act(() => {
            fireEvent.touchStart(node, touch(0));
            moveTo(1);
            moveTo(2);
            moveTo(3);
            moveTo(1);
            moveTo(2);
            moveTo(3);
        });

        expect(onTick).toHaveBeenCalledTimes(5);
        expect(onFill).not.toHaveBeenCalled();
    });

    it('ticks once for a move that skips several steps', () => {
        const { node, moveTo, onTick } = renderGauge();

        act(() => {
            fireEvent.touchStart(node, touch(0));
            moveTo(PULL_TO_REFRESH_STEPS - 1);
        });

        expect(onTick).toHaveBeenCalledTimes(1);
    });

    it('does not tick again for a finger trembling on a step boundary', () => {
        const { node, moveTo, onTick } = renderGauge();

        act(() => {
            fireEvent.touchStart(node, touch(0));
            moveTo(3);
            // One pull pixel under the boundary and back, twice: inside the hysteresis.
            fireEvent.touchMove(node, touch(3 * STEP_TRAVEL - 2));
            moveTo(3);
            fireEvent.touchMove(node, touch(3 * STEP_TRAVEL - 2));
            moveTo(3);
        });

        expect(onTick).toHaveBeenCalledTimes(1);
    });

    it('neither ticks nor fills again in the same touch once the gauge filled', async () => {
        const { node, moveTo, onTick, onFill, onRefresh } = renderGauge();

        await act(async () => {
            fireEvent.touchStart(node, touch(0));
            moveTo(PULL_TO_REFRESH_STEPS);
            moveTo(2);
            moveTo(PULL_TO_REFRESH_STEPS - 1);
            moveTo(PULL_TO_REFRESH_STEPS + 1);
        });

        expect(onTick).not.toHaveBeenCalled();
        expect(onFill).toHaveBeenCalledTimes(1);
        expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('does not fill on a pull that stays short of the threshold', () => {
        const { node, onFill, onRefresh } = renderGauge();

        act(() => pull(node, PULL_TO_REFRESH_THRESHOLD));

        expect(onFill).not.toHaveBeenCalled();
        expect(onRefresh).not.toHaveBeenCalled();
    });

    it('leaves the content under a finger still down when the refresh settles, and puts it back on release', async () => {
        const pending = deferred();
        const node = renderList(() => pending.promise);

        await act(async () => {
            fireEvent.touchStart(node, touch(0));
            fireEvent.touchMove(node, touch(PAST_THRESHOLD));
        });
        await act(async () => pending.resolve());

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(node.lastElementChild).toHaveStyle({
            transform: `translateY(${resolvePullDistance(PAST_THRESHOLD)}px)`,
        });

        await act(async () => {
            fireEvent.touchEnd(node, { touches: [] });
        });
        expect((node.lastElementChild as HTMLElement).style.transform).toBe('');
    });

    it('keeps the gauge reading while the list goes back after a short release', () => {
        const node = renderList(jest.fn().mockResolvedValue(undefined));

        act(() => pull(node, PULL_TO_REFRESH_THRESHOLD));

        // Half full when the finger let go, and still half full as the slot collapses — not emptied
        // on the first frame of the way out.
        const disc = node.firstElementChild?.firstElementChild as HTMLElement;
        expect(disc.style.opacity).toBe('0.5');
    });

    describe('character animation', () => {
        const animate = jest.fn();
        const cancels: jest.Mock[] = [];
        const originalAnimate = HTMLElement.prototype.animate;
        const originalMatchMedia = window.matchMedia;

        beforeEach(() => {
            cancels.length = 0;
            animate.mockReset().mockImplementation(() => {
                const cancel = jest.fn();
                cancels.push(cancel);
                return { cancel };
            });
            HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
        });

        afterEach(() => {
            HTMLElement.prototype.animate = originalAnimate;
            window.matchMedia = originalMatchMedia;
        });

        it('pops and then wobbles while the refresh runs, and stops when it settles', async () => {
            const pending = deferred();
            const node = renderList(() => pending.promise);

            await act(async () => pull(node, PAST_THRESHOLD));
            expect(animate).toHaveBeenCalledTimes(2);
            expect(animate.mock.calls[1][1]).toMatchObject({ iterations: Infinity });

            await act(async () => pending.resolve());
            expect(cancels.every(cancel => cancel.mock.calls.length === 1)).toBe(true);
        });

        it('stays still for a reader who asked for reduced motion', async () => {
            window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
            const node = renderList(() => new Promise(() => undefined));

            await act(async () => pull(node, PAST_THRESHOLD));

            expect(animate).not.toHaveBeenCalled();
        });
    });

    it('forwards the ref to the scroll container', () => {
        const ref = { current: null as HTMLDivElement | null };
        render(
            <PullToRefresh ref={ref} data-testid="list" onRefresh={jest.fn()}>
                row
            </PullToRefresh>
        );

        expect(ref.current).toBe(screen.getByTestId('list'));
    });
});
