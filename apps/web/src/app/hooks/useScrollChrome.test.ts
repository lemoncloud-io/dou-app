import { act, renderHook } from '@testing-library/react';

import { scrollChromeOf, useScrollChrome } from './useScrollChrome';

const boxAt = <T extends HTMLElement>(el: T, top: number): T => {
    el.getBoundingClientRect = () => ({ top }) as DOMRect;
    return el;
};

describe('scrollChromeOf', () => {
    it('is neither scrolled nor pinned at the top of the list', () => {
        expect(scrollChromeOf(0, 120)).toEqual({ scrolled: false, pinned: false });
    });

    it('is scrolled but not pinned while the anchor is still below the top', () => {
        expect(scrollChromeOf(40, 80)).toEqual({ scrolled: true, pinned: false });
    });

    it('pins once the anchor reaches the top, and stays pinned past it', () => {
        expect(scrollChromeOf(120, 0)).toEqual({ scrolled: true, pinned: true });
        expect(scrollChromeOf(900, -780)).toEqual({ scrolled: true, pinned: true });
    });

    it('does not pin an anchor that starts at the top of a list nobody has scrolled', () => {
        expect(scrollChromeOf(0, 0)).toEqual({ scrolled: false, pinned: false });
    });

    it('pins a row whose sticky top is negative only once the anchor passes that far up', () => {
        expect(scrollChromeOf(100, -4, -8)).toEqual({ scrolled: true, pinned: false });
        expect(scrollChromeOf(104, -8, -8)).toEqual({ scrolled: true, pinned: true });
    });

    it('never pins without an anchor', () => {
        expect(scrollChromeOf(500, null)).toEqual({ scrolled: true, pinned: false });
    });
});

describe('useScrollChrome', () => {
    const setUp = (anchorTop: number | null) => {
        const view = renderHook(() => useScrollChrome());
        if (anchorTop !== null) {
            (view.result.current.anchorRef as React.MutableRefObject<HTMLDivElement | null>).current = boxAt(
                document.createElement('div'),
                anchorTop
            );
        }
        const container = boxAt(document.createElement('div'), 100);
        const scrollTo = (top: number, nextAnchorTop?: number) => {
            container.scrollTop = top;
            const anchor = view.result.current.anchorRef.current;
            if (anchor && nextAnchorTop !== undefined) boxAt(anchor, nextAnchorTop);
            act(() => view.result.current.track(container));
        };
        return { view, scrollTo };
    };

    it('starts at the top', () => {
        const { view } = setUp(160);
        expect(view.result.current).toMatchObject({ scrolled: false, pinned: false });
    });

    it('measures the anchor against the container, not the viewport', () => {
        const { view, scrollTo } = setUp(160);

        scrollTo(20, 140);
        expect(view.result.current).toMatchObject({ scrolled: true, pinned: false });

        scrollTo(60, 100);
        expect(view.result.current).toMatchObject({ scrolled: true, pinned: true });

        scrollTo(0, 160);
        expect(view.result.current).toMatchObject({ scrolled: false, pinned: false });
    });

    it('reports scrolled but never pinned with no anchor mounted', () => {
        const { view, scrollTo } = setUp(null);
        scrollTo(300);
        expect(view.result.current).toMatchObject({ scrolled: true, pinned: false });
    });

    it('does not re-render on a scroll that flips neither flag', () => {
        let renders = 0;
        const view = renderHook(() => {
            renders += 1;
            return useScrollChrome();
        });
        const container = boxAt(document.createElement('div'), 0);

        container.scrollTop = 10;
        act(() => view.result.current.track(container));
        const afterFirstFlip = renders;

        for (let top = 20; top <= 400; top += 20) {
            container.scrollTop = top;
            act(() => view.result.current.track(container));
        }

        expect(renders - afterFirstFlip).toBeLessThanOrEqual(1);
    });
});
