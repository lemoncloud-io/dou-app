import { renderHook } from '@testing-library/react';

import { stashScroll, useScrollRestoration } from './useScrollRestoration';

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

        view.result.current.onScroll();
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

    it('auto-clears the pending claim once applied by default', () => {
        stashScroll('r-auto', -300);
        const { view, becomeReady } = mount('r-auto');

        becomeReady();
        expect(view.result.current.hasPendingRestore()).toBe(false);
    });

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
        const { container, becomeReady } = mount('r-short', 200, 500);

        becomeReady();
        expect(container.scrollTop).toBe(0);
    });

    it('hands an unspent claim back on an early unmount instead of losing it', () => {
        stashScroll('r-strict', -300);
        const first = mount('r-strict');
        first.view.unmount();

        const second = mount('r-strict');
        second.becomeReady();

        expect(second.container.scrollTop).toBe(-300);
    });

    it('keeps a position scrolled during the visit over a claim that was never applied', () => {
        stashScroll('r-newer', 640);
        const first = mount('r-newer', 200, 500);
        first.becomeReady();
        expect(first.container.scrollTop).toBe(0);

        first.container.scrollTop = 300;
        first.view.result.current.onScroll();
        first.view.unmount();

        const second = mount('r-newer');
        second.becomeReady();
        expect(second.container.scrollTop).toBe(300);
    });
});
