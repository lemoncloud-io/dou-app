import { renderHook } from '@testing-library/react';

import { stashScroll, useScrollRestoration } from './useScrollRestoration';

// Mirrors the sequencing `useChatScroll.test.ts` uses for its own restoration cases: the container
// is attached AFTER the initial render (nothing is mounted yet to attach it to), so the apply
// effect must be given a REAL `ready` transition afterwards to see it — attaching the ref and then
// re-rendering with an UNCHANGED `ready` does nothing, since React skips an effect whose deps
// didn't change.
const mount = (key: string | null | undefined, scrollHeight = 2000, clientHeight = 500) => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: clientHeight, configurable: true });

    const view = renderHook(({ ready }) => useScrollRestoration(key, ready), { initialProps: { ready: false } });
    (view.result.current.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = container;

    const becomeReady = () => view.rerender({ ready: true });
    return { view, container, becomeReady };
};

describe('useScrollRestoration', () => {
    // Test ids are unique per case: the memory is a module-level map keyed by string, and an
    // unmount re-populates it (RTL's automatic cleanup included), so reusing an id would leak one
    // test's state into the next.

    it('applies a saved offset once `ready`, not before', () => {
        stashScroll('r-basic', -640);
        const { container, becomeReady } = mount('r-basic');

        expect(container.scrollTop).toBe(0);
        becomeReady();
        expect(container.scrollTop).toBe(-640);
    });

    it('does nothing when nothing was ever saved for the key', () => {
        const { container, becomeReady } = mount('r-fresh');
        becomeReady();
        expect(container.scrollTop).toBe(0);
    });

    it('scopes memory by key — a different key never sees another key’s offset', () => {
        stashScroll('r-other', -640);
        const { container, becomeReady } = mount('r-mine');
        becomeReady();
        expect(container.scrollTop).toBe(0);
    });

    it('is a no-op end to end when key is null/undefined', () => {
        const { view, container, becomeReady } = mount(undefined);

        view.result.current.onScroll(); // reads containerRef — must not throw or write anywhere
        expect(view.result.current.hasPendingRestore()).toBe(false);
        becomeReady();
        expect(container.scrollTop).toBe(0);
    });

    it('records every scroll into the shared memory, read back by the next mount', () => {
        const first = mount('r-live');
        first.becomeReady();
        first.container.scrollTop = -820;
        first.view.result.current.onScroll();
        first.view.unmount();

        const second = mount('r-live');
        second.becomeReady();

        expect(second.container.scrollTop).toBe(-820);
    });

    // Without `manualConsume`, the hook clears the pending claim itself once applied — a caller
    // with no competing scroll behaviour (a plain list) needs no extra step.
    it('auto-clears the pending claim once applied by default', () => {
        stashScroll('r-auto', -300);
        const { view, becomeReady } = mount('r-auto');

        becomeReady();
        expect(view.result.current.hasPendingRestore()).toBe(false);
    });

    // With `manualConsume`, the claim survives the apply so a caller with a competing effect (an
    // auto-scroll pin) can check it in ITS OWN commit before releasing it.
    it('keeps the pending claim visible after applying it when manualConsume is set', () => {
        stashScroll('r-manual', -300);
        const container = document.createElement('div');
        Object.defineProperty(container, 'scrollHeight', { value: 2000, configurable: true });
        Object.defineProperty(container, 'clientHeight', { value: 500, configurable: true });

        const view = renderHook(({ ready }) => useScrollRestoration('r-manual', ready, { manualConsume: true }), {
            initialProps: { ready: false },
        });
        (view.result.current.containerRef as React.MutableRefObject<HTMLDivElement | null>).current = container;

        view.rerender({ ready: true });
        expect(container.scrollTop).toBe(-300);
        expect(view.result.current.hasPendingRestore()).toBe(true);

        view.result.current.consumePendingRestore();
        expect(view.result.current.hasPendingRestore()).toBe(false);
    });

    it('does not apply against a container with nothing to scroll (scrollHeight <= clientHeight)', () => {
        stashScroll('r-short', -300);
        const { container, becomeReady } = mount('r-short', 200, 500); // shorter than the viewport

        becomeReady();
        expect(container.scrollTop).toBe(0);
    });

    // A claim taken on mount but never applied (unmounted before `ready`) must go back untouched —
    // not be overwritten with whatever the container defaults to.
    it('hands an unspent claim back on an early unmount instead of losing it', () => {
        stashScroll('r-strict', -300);
        const first = mount('r-strict');
        first.view.unmount(); // never called becomeReady — the claim was never applied

        const second = mount('r-strict');
        second.becomeReady();

        expect(second.container.scrollTop).toBe(-300);
    });
});
