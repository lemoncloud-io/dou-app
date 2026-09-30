import { act, fireEvent, render, screen } from '@testing-library/react';

import { PULL_TO_REFRESH_THRESHOLD, PullToRefresh, resolvePullDistance } from './PullToRefresh';

/** Finger travel that clears the threshold once resistance halves it. */
const PAST_THRESHOLD = PULL_TO_REFRESH_THRESHOLD * 2 + 10;

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

describe('PullToRefresh', () => {
    it('refreshes when a pull from the top is released past the threshold', async () => {
        const onRefresh = jest.fn().mockResolvedValue(undefined);
        const node = renderList(onRefresh);

        await act(async () => pull(node, PAST_THRESHOLD));

        expect(onRefresh).toHaveBeenCalledTimes(1);
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

    it('drops the pull when the system cancels the touch', async () => {
        const onRefresh = jest.fn().mockResolvedValue(undefined);
        const node = renderList(onRefresh);

        await act(async () => {
            fireEvent.touchStart(node, touch(0));
            fireEvent.touchMove(node, touch(PAST_THRESHOLD));
            fireEvent.touchCancel(node, { touches: [] });
        });

        expect(onRefresh).not.toHaveBeenCalled();
    });

    it('cancels the native move while pulling, so the WebView does not scroll underneath', () => {
        const node = renderList(jest.fn().mockResolvedValue(undefined));

        fireEvent.touchStart(node, touch(0));
        const notCancelled = fireEvent.touchMove(node, touch(PAST_THRESHOLD));

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

    it('still ends the pull when the element under the finger is removed mid-drag', async () => {
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
        fireEvent.touchMove(skeleton, touch(PAST_THRESHOLD));
        // The host swaps the skeleton for real rows. The finger's events keep targeting the node,
        // which is now detached and bubbles to nobody.
        rerender(<List loading={false} />);
        expect(skeleton.isConnected).toBe(false);
        await act(async () => {
            fireEvent.touchEnd(skeleton, { touches: [] });
        });

        expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('drops the pull when a second finger lands', async () => {
        const onRefresh = jest.fn().mockResolvedValue(undefined);
        const node = renderList(onRefresh);

        await act(async () => {
            fireEvent.touchStart(node, touch(0));
            fireEvent.touchMove(node, touch(PAST_THRESHOLD));
            fireEvent.touchStart(node, {
                touches: [
                    { identifier: 1, clientX: 0, clientY: PAST_THRESHOLD },
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
