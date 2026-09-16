import { useEffect } from 'react';

/**
 * Escape-to-close for the trailing panels (thread, profile, saved, activity,
 * channel settings).
 *
 * Each panel used to install its own `window` keydown listener. Radix dispatches
 * its own Escape on `document` during the capture phase and does not stop
 * propagation, so a dialog opened *from* a panel closed both at once: one press,
 * two layers gone. The same applied to a popover — dismissing the emoji picker
 * tore down the pane the user was reading.
 *
 * So the listener asks first whether a Radix layer is on screen, and yields to
 * it when one is. The panel only closes when Escape had nothing else to close.
 */
const RADIX_LAYER_SELECTOR = [
    '[role="dialog"][data-state="open"]',
    '[role="alertdialog"][data-state="open"]',
    '[role="menu"][data-state="open"]',
    '[role="listbox"][data-state="open"]',
    '[data-radix-popper-content-wrapper]',
].join(',');

/** True while a dialog, alert dialog, menu, or popper-positioned layer is open. */
export const hasOpenOverlay = (): boolean => document.querySelector(RADIX_LAYER_SELECTOR) != null;

/** Pass `undefined` to install nothing — a panel with no dismiss action. */
export const useEscapeClose = (close?: () => void): void => {
    useEffect(() => {
        if (!close) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (hasOpenOverlay()) return;
            close();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [close]);
};
