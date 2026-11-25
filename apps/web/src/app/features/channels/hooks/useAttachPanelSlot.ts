import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { runtime } from '@chatic/runtime-react';
import { prefersReducedMotion, type AttachPanelHandle } from '@chatic/web-ui-kit';

import { KEYBOARD_MIN_PX } from '../../../ui/hooks/useKeyboardOpen';
import { createSlotSlide, type SlotSlide } from '../utils/slotSlide';
import { injectedLength, useKeyboardMemory } from './useKeyboardMemory';

export const PANEL_FALLBACK_HEIGHT = 306;

export const panelBodyHeight = (keyboard: number, safeBottom: number): number =>
    keyboard > 0 ? Math.max(0, keyboard - safeBottom) : PANEL_FALLBACK_HEIGHT;

export const KEYBOARD_COVER_MS = 300;

export const KEYBOARD_WAIT_MS = 800;

export const ATTACH_INSET_VAR = '--attach-inset';

export const COMPOSER_PADDING_BOTTOM = `max(8px, var(--safe-bottom, 0px), calc(max(var(--keyboard-height, 0px), var(${ATTACH_INSET_VAR}, 0px)) + 8px))`;

export type PanelMotion = 'slide' | 'instant';

interface SlotState {
    phase: 'closed' | 'open' | 'handover';
    enter: PanelMotion;
    exit: PanelMotion;
    body: number;
    safe: number;
}

const CLOSED: SlotState = { phase: 'closed', enter: 'slide', exit: 'slide', body: PANEL_FALLBACK_HEIGHT, safe: 0 };

export interface AttachPanelSlotInput {
    inputRef?: RefObject<HTMLTextAreaElement | null>;
    composerRef?: RefObject<HTMLElement | null>;
    onComposerSlide?: (sliding: boolean) => void;
}

export interface AttachPanelSlot {
    open: boolean;
    panel: {
        open: boolean;
        height: number;
        enter: PanelMotion;
        exit: PanelMotion;
        ref: RefObject<AttachPanelHandle | null>;
    };
    show: () => void;
    hide: () => void;
    handOver: () => void;
}

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
    const page = useRef({ composerRef, onComposerSlide });
    page.current = { composerRef, onComposerSlide };

    const placeComposer = useCallback((position: number) => {
        const { body, safe } = current.current;
        page.current.composerRef?.current?.style.setProperty(ATTACH_INSET_VAR, `${position * (body + safe)}px`);
    }, []);

    const slideRef = useRef<SlotSlide | null>(null);
    const motion = useCallback((): SlotSlide => {
        slideRef.current ??= createSlotSlide({
            draw: position => {
                const surface = panelRef.current?.surface;
                if (surface) surface.style.transform = `translateY(${(1 - position) * 100}%)`;
                placeComposer(position);
            },
            onStart: () => page.current.onComposerSlide?.(true),
            onStop: () => page.current.onComposerSlide?.(false),
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

    const target = state.phase === 'closed' ? 0 : 1;
    const how = state.phase === 'closed' ? state.exit : state.enter;
    const placed = useRef(0);
    useLayoutEffect(() => {
        if (placed.current === target) return;
        placed.current = target;
        const slide = motion();
        if (how === 'instant' || prefersReducedMotion()) {
            slide.jump(target);
            placeComposer(target);
        } else {
            slide.slide(target);
        }
    }, [target, how, motion, placeComposer]);

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

    const show = useCallback(() => {
        if (current.current.phase === 'open') return;
        stopHandover();
        const focused = !!inputRef?.current && document.activeElement === inputRef.current;
        const keyboardUp =
            injectedLength('--keyboard-height') >= KEYBOARD_MIN_PX ||
            (focused && runtime.appShell.reportsKeyboardHeight);
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
        if (!runtime.appShell.reportsKeyboardHeight) {
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
