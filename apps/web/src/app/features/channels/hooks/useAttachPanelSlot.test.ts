import { act, renderHook } from '@testing-library/react';

import {
    KEYBOARD_COVER_MS,
    KEYBOARD_WAIT_MS,
    PANEL_FALLBACK_HEIGHT,
    PANEL_SLIDE_MS,
    panelBodyHeight,
    useAttachPanelSlot,
    type AttachPanelSlot,
} from './useAttachPanelSlot';

let mockNative = true;
jest.mock('@chatic/bridges', () => ({ ...jest.requireActual('@chatic/bridges'), isNative: () => mockNative }));

/**
 * The shell's keyboard: a write of `--keyboard-height` to the root's inline style, as its injection
 * script does. The memory hook hears it a microtask later, so the write is flushed before going on.
 */
const keyboard = async (px: number) => {
    await act(async () => {
        document.documentElement.style.setProperty('--keyboard-height', `${px}px`);
    });
};

/** Where the composer's bottom actually sits: the page pads it by the larger of the two. */
const offset = (slot: AttachPanelSlot) =>
    Math.max(parseFloat(document.documentElement.style.getPropertyValue('--keyboard-height')) || 0, slot.composerInset);

const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

/** The hook with a composer field to focus, as the page has. */
const setup = () => {
    const field = document.createElement('textarea');
    document.body.appendChild(field);
    const hook = renderHook(() => useAttachPanelSlot({ current: field }));
    return { field, ...hook };
};

beforeEach(() => {
    jest.useFakeTimers();
    mockNative = true;
    document.documentElement.style.setProperty('--safe-bottom', '34px');
});

afterEach(() => {
    jest.useRealTimers();
    document.documentElement.style.removeProperty('--keyboard-height');
    document.documentElement.style.removeProperty('--safe-bottom');
    document.body.innerHTML = '';
});

// The keyboard memory lasts for the page's life: from the first test that shows a keyboard on, every
// panel opens at 336 (302 + the 34 safe area).
describe('useAttachPanelSlot — opening', () => {
    it('slides up with no keyboard, and the composer rises with it until the slide has ended', () => {
        const { result } = setup();

        act(() => result.current.show());

        expect(result.current.open).toBe(true);
        expect(result.current.panel).toMatchObject({ open: true, enter: 'slide', height: PANEL_FALLBACK_HEIGHT });
        expect(result.current.composerInset).toBe(PANEL_FALLBACK_HEIGHT + 34);
        expect(result.current.composerInsetAnimated).toBe(true);

        act(() => result.current.panel.onTransitionEnd('open'));

        expect(result.current.composerInsetAnimated).toBe(false);
    });

    it('is put in place at once behind a keyboard that is up, at its height, and the composer does not move', async () => {
        const { result } = setup();
        await keyboard(336);
        const before = offset(result.current);

        act(() => result.current.show());

        expect(result.current.panel).toMatchObject({ open: true, enter: 'instant', height: 302 });
        expect(result.current.composerInsetAnimated).toBe(false);
        expect(offset(result.current)).toBe(before);
        // The keyboard slides away and reveals the panel, which holds the composer where it was.
        await keyboard(0);
        expect(offset(result.current)).toBe(before);
    });

    it('takes a focused field for a keyboard on its way up in the app, before its height arrives', () => {
        const { result, field } = setup();
        field.focus();

        act(() => result.current.show());

        expect(result.current.panel.enter).toBe('instant');
        expect(result.current.composerInsetAnimated).toBe(false);
    });

    it('slides up in a browser even with the field focused: no keyboard is reported there', () => {
        mockNative = false;
        const { result, field } = setup();
        field.focus();

        act(() => result.current.show());

        expect(result.current.panel.enter).toBe('slide');
        expect(result.current.composerInsetAnimated).toBe(true);
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
        const { result } = setup();
        act(() => result.current.show());
        act(() => result.current.panel.onTransitionEnd('open'));
        const inset = result.current.composerInset;

        act(() => result.current.handOver());

        // Closed as far as the person is concerned — the + is back, the pick moves above the field —
        // but still in place, and still holding the composer up.
        expect(result.current.open).toBe(false);
        expect(result.current.panel.open).toBe(true);
        expect(result.current.composerInset).toBe(inset);
        await advance(500);
        await keyboard(336);
        expect(offset(result.current)).toBeGreaterThanOrEqual(inset);
        await advance(KEYBOARD_COVER_MS - 1);
        expect(result.current.panel.open).toBe(true);

        await advance(1);

        expect(result.current.panel).toMatchObject({ open: false, exit: 'instant' });
        expect(result.current.composerInset).toBe(0);
        expect(result.current.composerInsetAnimated).toBe(false);
        expect(offset(result.current)).toBe(inset);
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
        const { result } = setup();
        act(() => result.current.show());
        act(() => result.current.panel.onTransitionEnd('open'));
        act(() => result.current.handOver());

        await advance(KEYBOARD_WAIT_MS - 1);
        expect(result.current.panel.open).toBe(true);
        await advance(1);

        expect(result.current.panel).toMatchObject({ open: false, exit: 'slide' });
        expect(result.current.composerInset).toBe(0);
        expect(result.current.composerInsetAnimated).toBe(true);
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
        expect(result.current.composerInsetAnimated).toBe(true);
    });

    it('slides down with the composer at once in a browser, where no keyboard height ever comes', () => {
        mockNative = false;
        const { result } = setup();
        act(() => result.current.show());
        act(() => result.current.panel.onTransitionEnd('open'));

        act(() => result.current.handOver());

        expect(result.current.panel).toMatchObject({ open: false, exit: 'slide' });
        expect(result.current.composerInset).toBe(0);
        expect(result.current.composerInsetAnimated).toBe(true);
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
        expect(result.current.composerInsetAnimated).toBe(false);
    });

    it('does nothing while the panel is closed', () => {
        const { result } = setup();

        act(() => result.current.handOver());

        expect(result.current.panel.open).toBe(false);
        expect(result.current.composerInsetAnimated).toBe(false);
    });
});

describe('useAttachPanelSlot — closing', () => {
    it('slides down, and the composer descends with it until the slide has ended', () => {
        const { result } = setup();
        act(() => result.current.show());
        act(() => result.current.panel.onTransitionEnd('open'));

        act(() => result.current.hide());

        expect(result.current.open).toBe(false);
        expect(result.current.panel).toMatchObject({ open: false, exit: 'slide' });
        expect(result.current.composerInset).toBe(0);
        expect(result.current.composerInsetAnimated).toBe(true);
        act(() => result.current.panel.onTransitionEnd('closed'));
        expect(result.current.composerInsetAnimated).toBe(false);
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
        expect(result.current.composerInsetAnimated).toBe(true);
        act(() => result.current.show());
        await advance(KEYBOARD_WAIT_MS);
        expect(result.current.panel.open).toBe(true);
    });

    it('ignores the end of a slide it has turned around from', () => {
        const { result } = setup();
        act(() => result.current.show());
        act(() => result.current.hide());
        act(() => result.current.show());

        act(() => result.current.panel.onTransitionEnd('closed'));

        expect(result.current.composerInsetAnimated).toBe(true);
    });

    it('stops the composer following when the slide never says it ended', async () => {
        const { result } = setup();
        act(() => result.current.show());

        await advance(PANEL_SLIDE_MS + 100);

        expect(result.current.composerInsetAnimated).toBe(false);
    });

    it('does nothing while the panel is closed', () => {
        const { result } = setup();

        act(() => result.current.hide());

        expect(result.current.composerInsetAnimated).toBe(false);
    });

    it('stops waiting for the keyboard once unmounted', () => {
        const { result, unmount } = setup();
        act(() => result.current.show());
        act(() => result.current.handOver());

        unmount();

        expect(jest.getTimerCount()).toBe(0);
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
