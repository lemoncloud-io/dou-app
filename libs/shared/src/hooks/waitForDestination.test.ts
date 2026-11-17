import { waitForDestination } from './waitForDestination';

/** Records whether the promise has settled, without awaiting it. */
const track = (promise: Promise<void>) => {
    const state = { settled: false };
    void promise.then(() => {
        state.settled = true;
    });
    return state;
};

/** Lets MutationObserver callbacks and promise reactions run. */
const flushMicrotasks = () => Promise.resolve().then(() => undefined);

const renderSomething = () => document.body.appendChild(document.createElement('div'));

describe('waitForDestination', () => {
    afterEach(() => {
        jest.useRealTimers();
        document.body.innerHTML = '';
    });

    it('resolves once a push has rendered something, and not before', async () => {
        const wait = track(waitForDestination({ traversal: false }));

        await flushMicrotasks();
        expect(wait.settled).toBe(false);

        renderSomething();
        await flushMicrotasks();
        await flushMicrotasks();
        expect(wait.settled).toBe(true);
    });

    it('does not count a render made while the history entry is still the one being left', async () => {
        window.history.pushState({ idx: 4 }, '');
        const wait = track(waitForDestination({ traversal: true }));

        renderSomething();
        await flushMicrotasks();
        await flushMicrotasks();
        expect(wait.settled).toBe(false);
    });

    // The production order: the router's popstate listener runs first and React commits right after
    // it, before any listener of this module could run. So the entry change is read from history
    // itself, and no popstate event is needed at all.
    it('resolves on the first render after the history entry changed, with no popstate of its own', async () => {
        window.history.pushState({ idx: 4 }, '');
        const wait = track(waitForDestination({ traversal: true }));

        window.history.pushState({ idx: 3 }, '');
        renderSomething();
        await flushMicrotasks();
        await flushMicrotasks();
        expect(wait.settled).toBe(true);
    });

    it('gives up at the cap when nothing renders, so a traversal with nowhere to go cannot hang', async () => {
        jest.useFakeTimers();
        const wait = track(waitForDestination({ traversal: true, capMs: 300 }));

        jest.advanceTimersByTime(299);
        await flushMicrotasks();
        expect(wait.settled).toBe(false);

        jest.advanceTimersByTime(1);
        await flushMicrotasks();
        expect(wait.settled).toBe(true);
    });

    it('stops observing once settled, so a later render or the cap is not its business', async () => {
        jest.useFakeTimers();
        const disconnect = jest.spyOn(MutationObserver.prototype, 'disconnect');
        const wait = waitForDestination({ traversal: false });

        renderSomething();
        await wait;

        expect(disconnect).toHaveBeenCalledTimes(1);
        // The cap's timer was cleared with it.
        expect(jest.getTimerCount()).toBe(0);
        disconnect.mockRestore();
    });
});
