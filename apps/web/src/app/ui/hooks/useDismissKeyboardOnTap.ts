import { useEffect } from 'react';

import { typesOnSoftKeyboard } from '../../utils/softKeyboard';

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

const focusedTextField = (): HTMLElement | null => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement) return NON_TEXT_INPUT_TYPES.has(active.type) ? null : active;
    if (active instanceof HTMLTextAreaElement) return active;
    if (active instanceof HTMLElement && active.isContentEditable) return active;
    return null;
};

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
