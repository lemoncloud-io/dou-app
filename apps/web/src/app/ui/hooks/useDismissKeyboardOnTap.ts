import { useEffect } from 'react';

import { typesOnSoftKeyboard } from '../../utils/softKeyboard';

/**
 * What a tap can land on without closing the keyboard: anything that takes input, acts or focuses on
 * its own. A tap on a button keeps the keyboard so the press does what it says (a "send code" next to
 * the phone field); a tap on another field moves the cursor there. `tabindex="-1"` is left out on
 * purpose — a dialog's panel carries it, and a tap on the panel's empty space is exactly the tap that
 * should close the keyboard. A verification code's cells count as one control, gaps included.
 */
const INTERACTIVE_SELECTOR = [
    'input',
    'textarea',
    'select',
    'button',
    'a[href]',
    'label',
    'summary',
    '[contenteditable]:not([contenteditable="false"])',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="slider"]',
    '[role="combobox"]',
    '[role="textbox"]',
    '[tabindex]:not([tabindex="-1"])',
    '[data-return-key-unit]',
].join(', ');

/** Movement past this, in CSS pixels, makes the gesture a scroll or a drag rather than a tap. */
const TAP_SLOP_PX = 10;

const NON_TEXT_INPUT_TYPES = new Set([
    'hidden',
    'file',
    'checkbox',
    'radio',
    'button',
    'submit',
    'reset',
    'image',
    'range',
    'color',
]);

/** The focused element when it is one the soft keyboard is typing into, else `null`. */
const focusedTextField = (): HTMLElement | null => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement) return NON_TEXT_INPUT_TYPES.has(active.type) ? null : active;
    if (active instanceof HTMLTextAreaElement) return active;
    if (active instanceof HTMLElement && active.isContentEditable) return active;
    return null;
};

/**
 * Closes the soft keyboard when a tap lands on empty space, on every screen, mounted once at the app
 * root next to the return-key flow. The focused field loses focus (`blur`), which is what takes the
 * keyboard down on both platforms; nothing else about the tap changes.
 *
 * - Only a tap counts. A press that moves past {@link TAP_SLOP_PX} or that the browser cancels (it
 *   became a scroll) leaves the keyboard alone, so scrolling a form while typing keeps typing.
 * - A tap on anything interactive — another field, a button, a link, a switch — keeps the keyboard;
 *   see {@link INTERACTIVE_SELECTOR}.
 * - The chat and thread composers (`data-no-autoscroll`) are left alone: the room decides when its
 *   keyboard and attach panel come and go.
 * - Only where typing happens on the soft keyboard; a desktop browser keeps its own focus rules.
 *
 * Built from pointer events rather than `click`: WebKit on iOS sends no `click` for a tap on an
 * element with no click handler of its own, and the empty space this is for has none. Handled in
 * the capture phase, before the target's own handlers, so a handler that focuses a field on purpose
 * still wins.
 */
export const useDismissKeyboardOnTap = () => {
    useEffect(() => {
        let press: { id: number; x: number; y: number } | null = null;

        const handleDown = (event: PointerEvent) => {
            press = event.isPrimary ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
        };

        const handleCancel = () => {
            press = null;
        };

        const handleUp = (event: PointerEvent) => {
            const start = press;
            press = null;
            if (!start || start.id !== event.pointerId) return;
            if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX) return;

            const field = focusedTextField();
            if (!field || field.closest('[data-no-autoscroll]')) return;

            const target = event.target;
            if (!(target instanceof Element) || target.closest(INTERACTIVE_SELECTOR)) return;
            if (!typesOnSoftKeyboard()) return;

            field.blur();
        };

        document.addEventListener('pointerdown', handleDown, true);
        document.addEventListener('pointercancel', handleCancel, true);
        document.addEventListener('pointerup', handleUp, true);
        return () => {
            document.removeEventListener('pointerdown', handleDown, true);
            document.removeEventListener('pointercancel', handleCancel, true);
            document.removeEventListener('pointerup', handleUp, true);
        };
    }, []);
};
