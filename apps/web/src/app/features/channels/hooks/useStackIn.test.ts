import { renderHook } from '@testing-library/react';

import { STACK_IN_DURATION_MS, useStackIn } from './useStackIn';

type FakeAnimation = { cancel: jest.Mock; onfinish: (() => void) | null; oncancel: (() => void) | null };

const setup = (reducedMotion = false) => {
    const parent = document.createElement('div');
    parent.style.rowGap = '12px';
    const el = document.createElement('div');
    parent.appendChild(el);
    Object.defineProperty(el, 'offsetHeight', { value: 48 });
    const animation: FakeAnimation = {
        cancel: jest.fn(() => animation.oncancel?.()),
        onfinish: null,
        oncancel: null,
    };
    const animate = jest.fn(() => animation);
    el.animate = animate as unknown as HTMLElement['animate'];
    window.matchMedia = jest.fn(() => ({ matches: reducedMotion }) as MediaQueryList);
    return { el, animate, animation, ref: { current: el } };
};

describe('useStackIn', () => {
    it('grows the row from zero to its height and pulls in the gap above it', () => {
        const { el, animate, ref } = setup();

        renderHook(() => useStackIn(ref, true));

        expect(animate).toHaveBeenCalledWith(
            [
                { height: '0px', marginTop: '-12px', opacity: 0 },
                { height: '48px', marginTop: '0px', opacity: 1 },
            ],
            expect.objectContaining({ duration: STACK_IN_DURATION_MS })
        );
        expect(el.style.overflow).toBe('hidden');
    });

    it('releases the clip once the animation finishes', () => {
        const { el, animation, ref } = setup();

        renderHook(() => useStackIn(ref, true));
        animation.onfinish?.();

        expect(el.style.overflow).toBe('');
    });

    it('does not animate a row that was not entering at mount, even if it turns pending later', () => {
        const { animate, ref } = setup();

        const { rerender } = renderHook(({ enabled }) => useStackIn(ref, enabled), {
            initialProps: { enabled: false },
        });
        rerender({ enabled: true });

        expect(animate).not.toHaveBeenCalled();
    });

    it('skips the animation under reduced motion', () => {
        const { animate, ref } = setup(true);

        renderHook(() => useStackIn(ref, true));

        expect(animate).not.toHaveBeenCalled();
    });

    it('cancels the animation and releases the clip on unmount', () => {
        const { el, animation, ref } = setup();

        const { unmount } = renderHook(() => useStackIn(ref, true));
        unmount();

        expect(animation.cancel).toHaveBeenCalled();
        expect(el.style.overflow).toBe('');
    });
});
