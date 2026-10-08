import { act, renderHook } from '@testing-library/react';

import { SLIDE_MS } from '@chatic/web-ui-kit';

import {
    ATTACH_INSET_VAR,
    COMPOSER_PADDING_BOTTOM,
    KEYBOARD_COVER_MS,
    KEYBOARD_WAIT_MS,
    PANEL_FALLBACK_HEIGHT,
    panelBodyHeight,
    useAttachPanelSlot,
} from './useAttachPanelSlot';

let mockNative = true;
jest.mock('@chatic/bridges', () => ({ ...jest.requireActual('@chatic/bridges'), isNative: () => mockNative }));

/** One frame of the fake clock: jest's fake `requestAnimationFrame` runs every 16 ms. */
const FRAME_MS = 16;
const SAFE = 34;

/**
 * The shell's keyboard: a write of `--keyboard-height` to the root's inline style, as its injection
 * script does. The memory hook hears it a microtask later, so the write is flushed before going on.
 */
const keyboard = async (px: number) => {
    await act(async () => {
        document.documentElement.style.setProperty('--keyboard-height', `${px}px`);
    });
};
const keyboardHeight = () => parseFloat(document.documentElement.style.getPropertyValue('--keyboard-height')) || 0;

const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

/**
 * The hook with what the page and the kit hand it: a composer field to focus, the composer's bar it
 * writes the panel's share of the padding on, and the panel's handle — its sliding surface and the
 * `settle` that tells it a slide is over.
 */
const setup = () => {
    const field = document.createElement('textarea');
    const composer = document.createElement('div');
    document.body.append(field, composer);
    const surface = document.createElement('div');
    const settle = jest.fn();
    const onComposerSlide = jest.fn();
    const hook = renderHook(() =>
        useAttachPanelSlot({ inputRef: { current: field }, composerRef: { current: composer }, onComposerSlide })
    );
    hook.result.current.panel.ref.current = { surface, settle };

    /** px the composer keeps clear for the panel. */
    const inset = () => parseFloat(composer.style.getPropertyValue(ATTACH_INSET_VAR)) || 0;
    /** How far below its place the panel is drawn, in % of its own height; null where nothing was written. */
    const below = () => {
        const match = /^translateY\((-?[\d.e-]+)%\)$/.exec(surface.style.transform);
        return match ? parseFloat(match[1]) : null;
    };
    /** Where the composer's bottom actually sits: it pads by the larger of the keyboard and the panel. */
    const offset = () => Math.max(keyboardHeight(), inset());
    /** The panel's whole height: the body the slot measured, and the safe area under it. */
    const whole = () => hook.result.current.panel.height + SAFE;
    /** Each frame of the next `count`, as drawn: [panel % below its place, composer inset]. */
    const frames = (count: number) =>
        Array.from({ length: count }, () => {
            jest.advanceTimersByTime(FRAME_MS);
            return [below() ?? 0, inset()] as const;
        });
    return { field, composer, surface, settle, onComposerSlide, inset, below, offset, whole, frames, ...hook };
};

/** Each frame drew the panel's top edge and the composer's from one position: they never part. */
const expectTogether = (drawn: readonly (readonly [number, number])[], whole: number) => {
    for (const [below, inset] of drawn) expect(inset).toBeCloseTo((1 - below / 100) * whole, 6);
};

beforeEach(() => {
    jest.useFakeTimers();
    mockNative = true;
    document.documentElement.style.setProperty('--safe-bottom', `${SAFE}px`);
});

afterEach(() => {
    jest.useRealTimers();
    document.documentElement.style.removeProperty('--keyboard-height');
    document.documentElement.style.removeProperty('--safe-bottom');
    document.body.innerHTML = '';
    delete (window as { matchMedia?: unknown }).matchMedia;
});

describe('COMPOSER_PADDING_BOTTOM', () => {
    it('pads by the larger of the keyboard and the panel’s share, 8px above it, and clears the home indicator', () => {
        expect(COMPOSER_PADDING_BOTTOM).toBe(
            'max(8px, var(--safe-bottom, 0px), calc(max(var(--keyboard-height, 0px), var(--attach-inset, 0px)) + 8px))'
        );
    });
});

// The keyboard memory lasts for the page's life: from the first test that shows a keyboard on, every
// panel opens at 336 (302 + the 34 safe area).
describe('useAttachPanelSlot — opening', () => {
    it('slides up with no keyboard, moving the panel and the composer together on every frame', () => {
        const { result, below, inset, whole, frames, settle, onComposerSlide } = setup();

        act(() => result.current.show());

        expect(result.current.open).toBe(true);
        expect(result.current.panel).toMatchObject({ open: true, enter: 'slide', height: PANEL_FALLBACK_HEIGHT });
        // The slide's first frame is drawn in the commit that opens it: below its place, nothing held.
        expect(below()).toBe(100);
        expect(inset()).toBe(0);
        expect(onComposerSlide.mock.calls).toEqual([[true]]);

        const drawn = frames(Math.ceil(SLIDE_MS / FRAME_MS) + 1);

        expectTogether(drawn, whole());
        // Rising all the way, on the slide's curve: most of the way in its first half.
        const insets = drawn.map(([, value]) => value);
        expect(insets).toEqual([...insets].sort((a, b) => a - b));
        expect(insets[Math.floor(insets.length / 2)]).toBeGreaterThan(whole() * 0.75);
        expect(drawn.at(-1)).toEqual([0, whole()]);
        // Over: the panel is told, and the page stops following frame by frame.
        expect(settle).toHaveBeenCalledTimes(1);
        expect(onComposerSlide.mock.calls).toEqual([[true], [false]]);
    });

    it('is put in place at once behind a keyboard that is up, at its height, and the composer does not move', async () => {
        const { result, below, offset, settle, onComposerSlide } = setup();
        await keyboard(336);
        const before = offset();

        act(() => result.current.show());

        expect(result.current.panel).toMatchObject({ open: true, enter: 'instant', height: 302 });
        expect(offset()).toBe(before);
        // The panel puts itself in place: the slot draws nothing on it, now or on a later frame.
        jest.advanceTimersByTime(SLIDE_MS);
        expect(below()).toBeNull();
        expect(onComposerSlide).not.toHaveBeenCalled();
        expect(settle).not.toHaveBeenCalled();
        // The keyboard slides away and reveals the panel, which holds the composer where it was.
        await keyboard(0);
        expect(offset()).toBe(before);
    });

    it('takes a focused field for a keyboard on its way up in the app, before its height arrives', () => {
        const { result, field, inset, whole } = setup();
        field.focus();

        act(() => result.current.show());

        expect(result.current.panel.enter).toBe('instant');
        expect(inset()).toBe(whole());
    });

    it('slides up in a browser even with the field focused: no keyboard is reported there', () => {
        mockNative = false;
        const { result, field, onComposerSlide } = setup();
        field.focus();

        act(() => result.current.show());

        expect(result.current.panel.enter).toBe('slide');
        expect(onComposerSlide).toHaveBeenCalledWith(true);
    });

    it('does not take an accessory bar on its own for a keyboard', async () => {
        const { result } = setup();
        await keyboard(55);

        act(() => result.current.show());

        expect(result.current.panel.enter).toBe('slide');
    });
});

describe('useAttachPanelSlot — the field takes focus', () => {
    it('keeps the panel in place under the rising keyboard, then removes it at once once the keyboard covers it', async () => {
        const { result, inset, offset, frames, onComposerSlide } = setup();
        act(() => result.current.show());
        frames(Math.ceil(SLIDE_MS / FRAME_MS) + 1);
        const held = inset();
        onComposerSlide.mockClear();

        act(() => result.current.handOver());

        // Closed as far as the person is concerned — the + is back, the pick moves above the field —
        // but still in place, and still holding the composer up.
        expect(result.current.open).toBe(false);
        expect(result.current.panel.open).toBe(true);
        expect(inset()).toBe(held);
        await advance(500);
        await keyboard(336);
        expect(offset()).toBeGreaterThanOrEqual(held);
        await advance(KEYBOARD_COVER_MS - 1);
        expect(result.current.panel.open).toBe(true);

        await advance(1);

        expect(result.current.panel).toMatchObject({ open: false, exit: 'instant' });
        // Gone in the same commit, with nothing sliding: the keyboard holds the composer from here.
        expect(inset()).toBe(0);
        expect(offset()).toBe(336);
        expect(onComposerSlide).not.toHaveBeenCalled();
    });

    it('stops waiting for a height once one arrives, and lets the cover run its course', async () => {
        const { result } = setup();
        act(() => result.current.show());
        act(() => result.current.handOver());

        await advance(KEYBOARD_WAIT_MS - 100);
        await keyboard(336);
        await advance(200);

        // The height came in time: the wait gave way to the cover, which is still running.
        expect(result.current.panel.open).toBe(true);
        await advance(KEYBOARD_COVER_MS);
        expect(result.current.panel).toMatchObject({ open: false, exit: 'instant' });
    });

    it('slides down with the composer when no keyboard height comes', async () => {
        const { result, whole, frames, below, inset, settle, onComposerSlide } = setup();
        act(() => result.current.show());
        frames(Math.ceil(SLIDE_MS / FRAME_MS) + 1);
        settle.mockClear();
        onComposerSlide.mockClear();
        act(() => result.current.handOver());

        await advance(KEYBOARD_WAIT_MS - 1);
        expect(result.current.panel.open).toBe(true);
        await advance(1);

        expect(result.current.panel).toMatchObject({ open: false, exit: 'slide' });
        expect(onComposerSlide.mock.calls).toEqual([[true]]);
        const drawn = frames(Math.ceil(SLIDE_MS / FRAME_MS) + 1);
        expectTogether(drawn, whole());
        expect([below(), inset()]).toEqual([100, 0]);
        expect(settle).toHaveBeenCalledTimes(1);
        expect(onComposerSlide.mock.calls).toEqual([[true], [false]]);
    });

    it('counts only a keyboard arriving after the focus, not one still reported from before', async () => {
        const { result } = setup();
        // A keyboard on its way down: + was pressed with it up, and its 0 has not come yet.
        await keyboard(336);
        act(() => result.current.show());
        act(() => result.current.handOver());

        // The shell writes the root's style again with the old height still in it — every injection
        // writes all its variables — which is no keyboard arriving.
        await act(async () => {
            document.documentElement.style.setProperty('--safe-bottom', '34.5px');
        });
        await advance(KEYBOARD_COVER_MS + 100);
        expect(result.current.panel.open).toBe(true);
        // It goes down, and the one the focus raised comes up.
        await keyboard(0);
        await keyboard(336);
        await advance(KEYBOARD_COVER_MS);

        expect(result.current.panel).toMatchObject({ open: false, exit: 'instant' });
    });

    it('does not take an accessory bar for the keyboard covering the panel', async () => {
        const { result } = setup();
        act(() => result.current.show());
        act(() => result.current.handOver());

        await keyboard(55);
        await advance(KEYBOARD_WAIT_MS);

        expect(result.current.panel).toMatchObject({ open: false, exit: 'slide' });
    });

    it('slides down with the composer at once in a browser, where no keyboard height ever comes', () => {
        mockNative = false;
        const { result, frames, whole, inset } = setup();
        act(() => result.current.show());
        frames(Math.ceil(SLIDE_MS / FRAME_MS) + 1);

        act(() => result.current.handOver());

        expect(result.current.panel).toMatchObject({ open: false, exit: 'slide' });
        const drawn = frames(Math.ceil(SLIDE_MS / FRAME_MS) + 1);
        expectTogether(drawn, whole());
        expect(inset()).toBe(0);
    });

    it('stays where it is when + is pressed again before the keyboard covers it', async () => {
        const { result, field } = setup();
        act(() => result.current.show());
        field.focus();
        act(() => result.current.handOver());
        await keyboard(336);

        act(() => result.current.show());
        await advance(KEYBOARD_WAIT_MS + KEYBOARD_COVER_MS);

        // In place all along, under the keyboard the + now drops, and the handover's timers are gone.
        expect(result.current.open).toBe(true);
        expect(result.current.panel).toMatchObject({ open: true, enter: 'instant' });
    });

    it('does nothing while the panel is closed', () => {
        const { result, onComposerSlide } = setup();

        act(() => result.current.handOver());

        expect(result.current.panel.open).toBe(false);
        expect(onComposerSlide).not.toHaveBeenCalled();
    });
});

describe('useAttachPanelSlot — closing', () => {
    it('slides down, and the composer descends with it on the same frames', () => {
        const { result, frames, whole, below, inset, settle, onComposerSlide } = setup();
        act(() => result.current.show());
        frames(Math.ceil(SLIDE_MS / FRAME_MS) + 1);
        settle.mockClear();
        onComposerSlide.mockClear();

        act(() => result.current.hide());

        expect(result.current.open).toBe(false);
        expect(result.current.panel).toMatchObject({ open: false, exit: 'slide' });
        const drawn = frames(Math.ceil(SLIDE_MS / FRAME_MS) + 1);
        expectTogether(drawn, whole());
        const insets = drawn.map(([, value]) => value);
        expect(insets).toEqual([...insets].sort((a, b) => b - a));
        expect([below(), inset()]).toEqual([100, 0]);
        expect(settle).toHaveBeenCalledTimes(1);
        expect(onComposerSlide.mock.calls).toEqual([[true], [false]]);
    });

    it('turns around from where the slide up has got to when × comes before it ends', () => {
        const { result, frames, whole, below, inset, settle, onComposerSlide } = setup();
        act(() => result.current.show());
        const up = frames(4);
        const [reachedBelow, reachedInset] = up.at(-1) ?? [0, 0];
        expect(reachedInset).toBeGreaterThan(0);
        expect(reachedInset).toBeLessThan(whole());

        act(() => result.current.hide());

        // Drawn again where it stood: no jump to either end.
        expect([below(), inset()]).toEqual([reachedBelow, reachedInset]);
        const down = frames(Math.ceil(SLIDE_MS / FRAME_MS) + 1);
        expectTogether(down, whole());
        expect([below(), inset()]).toEqual([100, 0]);
        // One movement, start to stop, and only the close it ended on is settled.
        expect(onComposerSlide.mock.calls).toEqual([[true], [false]]);
        expect(settle).toHaveBeenCalledTimes(1);
    });

    it('slides down from under a rising keyboard too, and stops waiting for it', async () => {
        const { result } = setup();
        act(() => result.current.show());
        act(() => result.current.handOver());

        act(() => result.current.hide());
        await keyboard(336);
        await advance(KEYBOARD_COVER_MS);

        // The keyboard arriving now is no handover's to finish: the slide down runs its course.
        expect(result.current.panel).toMatchObject({ open: false, exit: 'slide' });
        act(() => result.current.show());
        await advance(KEYBOARD_WAIT_MS);
        expect(result.current.panel.open).toBe(true);
    });

    it('stops a slide where it stands for an instant change, and lets the page stop following', async () => {
        const { result, frames, whole, inset, settle, onComposerSlide } = setup();
        act(() => result.current.show());
        frames(Math.ceil(SLIDE_MS / FRAME_MS) + 1);
        act(() => result.current.hide());
        frames(3);
        onComposerSlide.mockClear();
        settle.mockClear();
        await keyboard(336);

        // + with the keyboard up while the panel is on its way down: in place at once.
        act(() => result.current.show());

        expect(result.current.panel).toMatchObject({ open: true, enter: 'instant' });
        expect(inset()).toBe(whole());
        expect(onComposerSlide.mock.calls).toEqual([[false]]);
        // The slide down is over for good: no later frame draws on.
        frames(Math.ceil(SLIDE_MS / FRAME_MS) + 1);
        expect(inset()).toBe(whole());
        expect(settle).not.toHaveBeenCalled();
    });

    it('does nothing while the panel is closed', () => {
        const { result, onComposerSlide, inset } = setup();

        act(() => result.current.hide());
        jest.advanceTimersByTime(SLIDE_MS);

        expect(onComposerSlide).not.toHaveBeenCalled();
        expect(inset()).toBe(0);
    });

    it('stops waiting for the keyboard, and stops its frames, once unmounted', () => {
        const { result, unmount } = setup();
        act(() => result.current.show());
        act(() => result.current.handOver());

        unmount();

        expect(jest.getTimerCount()).toBe(0);
    });
});

describe('useAttachPanelSlot — reduced motion', () => {
    beforeEach(() => {
        window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    });

    it('opens and closes at once, with no frames and nothing for the page to follow', () => {
        const { result, inset, whole, below, onComposerSlide } = setup();

        act(() => result.current.show());

        expect(inset()).toBe(whole());

        act(() => result.current.hide());

        expect(inset()).toBe(0);
        jest.advanceTimersByTime(SLIDE_MS);
        // The panel puts itself in place, or takes itself away, as for any instant change.
        expect(below()).toBeNull();
        expect(onComposerSlide).not.toHaveBeenCalled();
    });
});

describe('panelBodyHeight', () => {
    it('is the keyboard’s height less the safe area, so the whole panel is the keyboard’s height', () => {
        expect(panelBodyHeight(336, 34)).toBe(302);
        expect(panelBodyHeight(300, 0)).toBe(300);
    });

    it('is the design’s keyboard before any keyboard has been seen', () => {
        expect(panelBodyHeight(0, 34)).toBe(PANEL_FALLBACK_HEIGHT);
        expect(PANEL_FALLBACK_HEIGHT).toBe(306);
    });
});
