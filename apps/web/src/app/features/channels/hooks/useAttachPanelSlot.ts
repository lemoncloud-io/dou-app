import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { isNative } from '@chatic/bridges';

import { KEYBOARD_MIN_PX } from '../../../ui/hooks/useKeyboardOpen';
import { injectedLength, useKeyboardMemory } from './useKeyboardMemory';

/**
 * The panel's body height before any keyboard has been seen on this page: the keyboard the design
 * draws in the panel's place (Figma `3749:27999`).
 */
export const PANEL_FALLBACK_HEIGHT = 306;

/**
 * The attach panel's body height — the part above the safe area, which the panel adds itself.
 *
 * With a keyboard seen, the whole panel is as tall as that keyboard, so trading one for the other
 * leaves the composer where it was. The height the shell reports runs down to the screen's bottom
 * edge, safe area included (`useKeyboardHeight` in the app), so the body is that height less the safe
 * area. Before any keyboard, the design's.
 */
export const panelBodyHeight = (keyboard: number, safeBottom: number): number =>
    keyboard > 0 ? Math.max(0, keyboard - safeBottom) : PANEL_FALLBACK_HEIGHT;

/** How long the panel's slide takes — and the composer's, which moves with it. */
export const PANEL_SLIDE_MS = 300;

/**
 * After the keyboard's height first arrives, how long until the keyboard covers the panel. iOS reports
 * the height as the keyboard starts to rise and Android once it is up, so one wait has to cover both:
 * on iOS it is the rise itself, on Android a keyboard already in place.
 */
export const KEYBOARD_COVER_MS = 300;

/**
 * How long a focus waits for the keyboard's height before taking it that none is coming — a hardware
 * keyboard, or a floating one that covers nothing at the bottom.
 */
export const KEYBOARD_WAIT_MS = 800;

/**
 * How long a slide may run before the composer stops following it anyway. The panel says when its
 * slide has ended, but under reduced motion, or in a document that is not being drawn, the transition
 * it waits on never runs — and a composer left transitioning would trail the keyboard from then on.
 */
const SLIDE_END_FALLBACK_MS = PANEL_SLIDE_MS + 100;

/**
 * The classes that make the composer's bottom padding move with the panel: the panel's 300 ms on the
 * photo screens' curve. Applied only while `composerInsetAnimated` says so, so the keyboard still moves
 * the composer at once. The curve is spelled as a property: the arbitrary-value easing utility is
 * claimed by tailwindcss-animate as well, and a class two plugins claim emits no rule. Reduced motion
 * drops the transition, as it drops the panel's.
 */
export const COMPOSER_INSET_MOTION =
    'transition-[padding-bottom] duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none';

/** `instant`: the panel appears or goes in place, with the keyboard over it. `slide`: it moves. */
export type PanelMotion = 'slide' | 'instant';

interface SlotState {
    /**
     * `handover`: the field took focus while the panel was open. The keyboard is on its way over the
     * panel, which stays in place, still taking up room, until the keyboard covers it.
     */
    phase: 'closed' | 'open' | 'handover';
    enter: PanelMotion;
    exit: PanelMotion;
    /** The composer's offset is following a sliding panel. */
    animated: boolean;
    /** Measured as the panel opens and kept while it is up, so a keyboard event meanwhile cannot move it. */
    body: number;
    safe: number;
}

const CLOSED: SlotState = {
    phase: 'closed',
    enter: 'slide',
    exit: 'slide',
    animated: false,
    body: PANEL_FALLBACK_HEIGHT,
    safe: 0,
};

export interface AttachPanelSlot {
    /**
     * Open as far as the person is concerned: the + shows ×, and the panel's recent row is where the
     * pick shows. False from the moment the field takes focus, while the panel may still be in place
     * under the rising keyboard.
     */
    open: boolean;
    /** What the kit's `AttachPanel` takes. */
    panel: {
        open: boolean;
        height: number;
        enter: PanelMotion;
        exit: PanelMotion;
        onTransitionEnd: (state: 'open' | 'closed') => void;
    };
    /**
     * px the composer keeps clear at the bottom for the panel: its whole height (body and safe area)
     * while it is in place, 0 once it is gone. The page pads by the larger of this and the keyboard.
     */
    composerInset: number;
    /** Whether a change to `composerInset` should move the composer over the panel's slide. */
    composerInsetAnimated: boolean;
    /** The + : the panel takes the keyboard's place, or rises from below when there is none. */
    show: () => void;
    /** ×, back, and everything that leaves the panel for something else: it slides down. */
    hide: () => void;
    /** The field took focus: the keyboard takes the panel's place. */
    handOver: () => void;
}

/**
 * The place under the composer that the soft keyboard and the attach panel take turns in, so that the
 * two hand it over like one surface: the composer never moves when one replaces the other, and moves
 * with the panel when there is nothing to replace.
 *
 * - **+ with the keyboard up** puts the panel in place at once, behind the keyboard, at the keyboard's
 *   height; the caller then drops the keyboard, which slides away to reveal it. "Up" is a keyboard
 *   height injected at the press, or — in the app, where Android reports it only once the keyboard is
 *   up — the field holding focus.
 * - **+ with no keyboard** slides the panel up, and the composer rises with it.
 * - **Focusing the field** in the app keeps the panel in place while the keyboard rises over it, and
 *   removes it at once `KEYBOARD_COVER_MS` after the keyboard's height first arrives — iOS reports
 *   it as the keyboard starts to move, Android once it has. A height already there at the focus does
 *   not count: it is a keyboard on its way down, and the one coming up reports anew. Only a height that
 *   counts as a keyboard (`KEYBOARD_MIN_PX`) does — iOS reports an accessory bar on its own for a
 *   hardware keyboard, and that covers nothing. With no height after `KEYBOARD_WAIT_MS` the panel
 *   slides down with the composer, as for ×. In a browser no height ever comes, so it slides at once.
 * - **×, back and the rest** slide the panel down, and the composer descends with it.
 *
 * The composer's offset is the larger of the keyboard and `composerInset` throughout, which is what
 * keeps it still across a handover. It moves over the slide (`composerInsetAnimated`) only when the
 * panel moves it: the keyboard's own changes stay instant, so the composer keeps tracking the keyboard
 * exactly. The panel's height is the last keyboard seen on the page (`useKeyboardMemory`).
 *
 * The state lives in a ref as well as in React state: the handlers read where the panel is at the
 * moment they run — a focus right after a +, a timer firing after a press — not where it was at the
 * last render.
 */
export const useAttachPanelSlot = (inputRef?: RefObject<HTMLTextAreaElement | null>): AttachPanelSlot => {
    const [state, setState] = useState<SlotState>(CLOSED);
    const current = useRef(state);
    const update = useCallback((next: Partial<SlotState>) => {
        current.current = { ...current.current, ...next };
        setState(current.current);
    }, []);

    // The handover under way: whether a height below a keyboard's has been seen since the focus (so the
    // next keyboard-sized one is the keyboard arriving), and its two timers.
    const handover = useRef<{ sawLow: boolean; wait: number; cover?: number } | null>(null);
    const stopHandover = useCallback(() => {
        const watch = handover.current;
        if (!watch) return;
        window.clearTimeout(watch.wait);
        window.clearTimeout(watch.cover);
        handover.current = null;
    }, []);
    useEffect(() => stopHandover, [stopHandover]);

    const keyboardHeight = useKeyboardMemory(height => {
        const watch = handover.current;
        if (!watch || watch.cover !== undefined) return;
        if (height < KEYBOARD_MIN_PX) {
            watch.sawLow = true;
            return;
        }
        if (!watch.sawLow) return;
        window.clearTimeout(watch.wait);
        watch.cover = window.setTimeout(() => {
            handover.current = null;
            update({ phase: 'closed', exit: 'instant', animated: false });
        }, KEYBOARD_COVER_MS);
    });

    // Pressed again while handing over, the panel is still in place and the field still focused, so it
    // stays put as for any keyboard — measured again, to the keyboard that has meanwhile come up.
    const show = useCallback(() => {
        if (current.current.phase === 'open') return;
        stopHandover();
        // Read before the caller's blur drops the keyboard: a keyboard still up is the height to match.
        const focused = !!inputRef?.current && document.activeElement === inputRef.current;
        const keyboardUp = injectedLength('--keyboard-height') >= KEYBOARD_MIN_PX || (focused && isNative());
        const safe = injectedLength('--safe-bottom');
        update({
            phase: 'open',
            enter: keyboardUp ? 'instant' : 'slide',
            animated: !keyboardUp,
            body: panelBodyHeight(keyboardHeight(), safe),
            safe,
        });
    }, [inputRef, keyboardHeight, stopHandover, update]);

    const hide = useCallback(() => {
        stopHandover();
        if (current.current.phase === 'closed') return;
        update({ phase: 'closed', exit: 'slide', animated: true });
    }, [stopHandover, update]);

    const handOver = useCallback(() => {
        if (current.current.phase !== 'open') return;
        if (!isNative()) {
            hide();
            return;
        }
        update({ phase: 'handover' });
        handover.current = {
            sawLow: injectedLength('--keyboard-height') < KEYBOARD_MIN_PX,
            wait: window.setTimeout(() => {
                handover.current = null;
                update({ phase: 'closed', exit: 'slide', animated: true });
            }, KEYBOARD_WAIT_MS),
        };
    }, [hide, update]);

    // A slide's end releases the composer — the slide that is running, not one it turned around from.
    const onTransitionEnd = useCallback(
        (end: 'open' | 'closed') => {
            const { animated, phase } = current.current;
            if (animated && (end === 'open') === (phase !== 'closed')) update({ animated: false });
        },
        [update]
    );

    useEffect(() => {
        if (!state.animated) return undefined;
        const timer = window.setTimeout(() => update({ animated: false }), SLIDE_END_FALLBACK_MS);
        return () => window.clearTimeout(timer);
    }, [state.animated, state.phase, update]);

    const inPlace = state.phase !== 'closed';
    return {
        open: state.phase === 'open',
        panel: { open: inPlace, height: state.body, enter: state.enter, exit: state.exit, onTransitionEnd },
        composerInset: inPlace ? state.body + state.safe : 0,
        composerInsetAnimated: state.animated,
        show,
        hide,
        handOver,
    };
};
