import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { isNative } from '@chatic/bridges';
import { prefersReducedMotion, type AttachPanelHandle } from '@chatic/web-ui-kit';

import { KEYBOARD_MIN_PX } from '../../../ui/hooks/useKeyboardOpen';
import { createSlotSlide, type SlotSlide } from '../utils/slotSlide';
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
 * The custom property the slot writes on the composer: px it keeps clear at the bottom for the panel —
 * the panel's whole height while it is in place, 0 once it is gone, and every height in between, frame
 * by frame, while it slides. Only the slot writes it; the page never renders it.
 */
export const ATTACH_INSET_VAR = '--attach-inset';

/**
 * The composer's bottom padding: 8px above the keyboard, or the attach panel standing in its place, and
 * otherwise clear of the home indicator. The larger of the keyboard and the panel, never a sum — while
 * the two trade places both are there, and the composer stays where the taller puts it; and the
 * keyboard, like the panel's inset, already reaches the screen's edge, safe area included.
 */
export const COMPOSER_PADDING_BOTTOM = `max(8px, var(--safe-bottom, 0px), calc(max(var(--keyboard-height, 0px), var(${ATTACH_INSET_VAR}, 0px)) + 8px))`;

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
    /** Measured as the panel opens and kept while it is up, so a keyboard event meanwhile cannot move it. */
    body: number;
    safe: number;
}

const CLOSED: SlotState = { phase: 'closed', enter: 'slide', exit: 'slide', body: PANEL_FALLBACK_HEIGHT, safe: 0 };

export interface AttachPanelSlotInput {
    /** The composer's field: focused in the app, it is a keyboard on its way up. */
    inputRef?: RefObject<HTMLTextAreaElement | null>;
    /** The composer's bar, padded by `COMPOSER_PADDING_BOTTOM`: the slot writes `ATTACH_INSET_VAR` on it. */
    composerRef?: RefObject<HTMLElement | null>;
    /**
     * Told `true` as a slide starts moving the composer, and `false` once it has stopped, so the page can
     * keep what follows the composer — the message list — in step frame by frame without rendering
     * itself on each one. Read at the call, so it may be a new function on every render.
     */
    onComposerSlide?: (sliding: boolean) => void;
}

export interface AttachPanelSlot {
    /**
     * Open as far as the person is concerned: the + shows ×, and the panel's recent row is where the
     * pick shows. False from the moment the field takes focus, while the panel may still be in place
     * under the rising keyboard.
     */
    open: boolean;
    /** What the kit's `AttachPanel` takes, with `motion="external"`. */
    panel: {
        open: boolean;
        height: number;
        enter: PanelMotion;
        exit: PanelMotion;
        /** The panel's handle: the slot moves its surface through a slide, and settles it at the end. */
        ref: RefObject<AttachPanelHandle | null>;
    };
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
 * The composer pads itself by the larger of the keyboard and the panel (`COMPOSER_PADDING_BOTTOM`),
 * which is what keeps it still across a handover; the panel's share is `ATTACH_INSET_VAR`, written here
 * on the composer. An instant change writes it in the commit that makes the change, before anything is
 * painted. A slide writes it on every frame of one `requestAnimationFrame` loop (`createSlotSlide`) that
 * writes the panel's translate in the same call, from the same eased position — the panel moves itself
 * no longer (`motion="external"`) — so the composer's edge and the panel's stay 8px apart on every
 * frame. A slide asked for mid-slide turns around from where the first one has got to. The keyboard's
 * own changes never go through the loop: it moves the composer through `--keyboard-height`, at once, so
 * the composer keeps tracking the keyboard exactly. Under reduced motion every change is instant.
 *
 * The panel's height is the last keyboard seen on the page (`useKeyboardMemory`).
 *
 * The state lives in a ref as well as in React state: the handlers read where the panel is at the
 * moment they run — a focus right after a +, a timer firing after a press — not where it was at the
 * last render.
 */
export const useAttachPanelSlot = ({
    inputRef,
    composerRef,
    onComposerSlide,
}: AttachPanelSlotInput = {}): AttachPanelSlot => {
    const [state, setState] = useState<SlotState>(CLOSED);
    const current = useRef(state);
    const update = useCallback((next: Partial<SlotState>) => {
        current.current = { ...current.current, ...next };
        setState(current.current);
    }, []);

    const panelRef = useRef<AttachPanelHandle | null>(null);
    // The page's side, read at the frame: the loop outlives the render that started it.
    const page = useRef({ composerRef, onComposerSlide });
    page.current = { composerRef, onComposerSlide };

    // The panel's share of the composer's offset at a position of the slot (0 gone, 1 in place).
    const placeComposer = useCallback((position: number) => {
        const { body, safe } = current.current;
        page.current.composerRef?.current?.style.setProperty(ATTACH_INSET_VAR, `${position * (body + safe)}px`);
    }, []);

    // Created once, on the first change; everything it touches is read through refs at the frame.
    const slideRef = useRef<SlotSlide | null>(null);
    const motion = useCallback((): SlotSlide => {
        slideRef.current ??= createSlotSlide({
            draw: position => {
                // `translateY(100%)` is below its place, safe area and all, and `0` is in place.
                const surface = panelRef.current?.surface;
                if (surface) surface.style.transform = `translateY(${(1 - position) * 100}%)`;
                placeComposer(position);
            },
            onStart: () => page.current.onComposerSlide?.(true),
            onStop: () => page.current.onComposerSlide?.(false),
            // The panel waits to be told: it rests where the slide started until then.
            onArrive: () => panelRef.current?.settle(),
        });
        return slideRef.current;
    }, [placeComposer]);
    useEffect(
        () => () => {
            slideRef.current?.dispose();
            slideRef.current = null;
        },
        []
    );

    // Moves the slot to where the state now puts it — before paint, in the commit that changed it, so the
    // slide's first frame or the instant change is what is painted first. The panel's own effects run
    // first (it is a child), so by now an opening panel is in the page, and a change is waiting on it.
    const target = state.phase === 'closed' ? 0 : 1;
    const how = state.phase === 'closed' ? state.exit : state.enter;
    const placed = useRef(0);
    useLayoutEffect(() => {
        if (placed.current === target) return;
        placed.current = target;
        const slide = motion();
        if (how === 'instant' || prefersReducedMotion()) {
            slide.jump(target);
            // Only the composer: the panel puts itself in place, or leaves, on its own in an instant
            // change, and clears whatever a cut-short slide had drawn on it.
            placeComposer(target);
        } else {
            slide.slide(target);
        }
    }, [target, how, motion, placeComposer]);

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
            update({ phase: 'closed', exit: 'instant' });
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
            body: panelBodyHeight(keyboardHeight(), safe),
            safe,
        });
    }, [inputRef, keyboardHeight, stopHandover, update]);

    const hide = useCallback(() => {
        stopHandover();
        if (current.current.phase === 'closed') return;
        update({ phase: 'closed', exit: 'slide' });
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
                update({ phase: 'closed', exit: 'slide' });
            }, KEYBOARD_WAIT_MS),
        };
    }, [hide, update]);

    return {
        open: state.phase === 'open',
        panel: {
            open: state.phase !== 'closed',
            height: state.body,
            enter: state.enter,
            exit: state.exit,
            ref: panelRef,
        },
        show,
        hide,
        handOver,
    };
};
