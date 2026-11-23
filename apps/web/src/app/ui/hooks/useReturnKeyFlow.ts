import { useEffect } from 'react';

import { typesOnSoftKeyboard } from '../../utils/softKeyboard';

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

const SCOPE_SELECTOR = '[role="dialog"], [role="alertdialog"], form';

const FIELD_SELECTOR = 'input, textarea';

const RETURN_KEY_UNIT_ATTR = 'data-return-key-unit';

const isTextInput = (el: Element): el is HTMLInputElement =>
    el instanceof HTMLInputElement && !NON_TEXT_INPUT_TYPES.has(el.type);

const isExcluded = (el: Element): boolean => !!el.closest('[data-no-autoscroll]');

const isFocusable = (el: HTMLInputElement | HTMLTextAreaElement): boolean =>
    !el.disabled &&
    !el.readOnly &&
    !el.closest('[inert]') &&
    el.getClientRects().length > 0 &&
    el.checkVisibility?.({ visibilityProperty: true }) !== false;

const scopeOf = (el: Element): Element | null => el.closest(SCOPE_SELECTOR);

const positionsAround = (field: Element): Element[][] => {
    const scope = scopeOf(field);
    const root = scope ?? document.body;
    const positions: Element[][] = [];
    const unitIndex = new Map<Element, number>();

    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(FIELD_SELECTOR).forEach(el => {
        if (el instanceof HTMLInputElement && (!isTextInput(el) || el.type === 'search')) return;
        if (scopeOf(el) !== scope || isExcluded(el) || !isFocusable(el)) return;

        const unit = el.closest(`[${RETURN_KEY_UNIT_ATTR}]`);
        if (!unit) {
            positions.push([el]);
            return;
        }
        const index = unitIndex.get(unit);
        if (index === undefined) {
            unitIndex.set(unit, positions.length);
            positions.push([el]);
        } else {
            positions[index].push(el);
        }
    });

    return positions;
};

const nextFieldAfter = (field: Element): HTMLElement | null => {
    const positions = positionsAround(field);
    const index = positions.findIndex(position => position.includes(field));
    if (index === -1) return null;
    return (positions[index + 1]?.[0] as HTMLElement | undefined) ?? null;
};

const isFlowInput = (el: EventTarget | null): el is HTMLInputElement =>
    el instanceof Element && isTextInput(el) && el.type !== 'search' && !isExcluded(el);

const applyHint = (input: HTMLInputElement) => {
    input.setAttribute('enterkeyhint', nextFieldAfter(input) ? 'next' : 'done');
};

export const useReturnKeyFlow = () => {
    useEffect(() => {
        const handleLabel = (event: Event) => {
            if (isFlowInput(event.target) && typesOnSoftKeyboard()) applyHint(event.target);
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' || event.defaultPrevented) return;
            if (event.isComposing || event.keyCode === 229) return;
            if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;

            const target = event.target;
            if (!(target instanceof Element) || !isTextInput(target) || isExcluded(target)) return;
            if (!typesOnSoftKeyboard()) return;

            event.preventDefault();
            const next = target.getAttribute('enterkeyhint') === 'next' ? nextFieldAfter(target) : null;
            if (!next) {
                target.blur();
                return;
            }
            if (isFlowInput(next)) applyHint(next);
            next.focus();
        };

        document.addEventListener('pointerdown', handleLabel, true);
        document.addEventListener('focusin', handleLabel);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handleLabel, true);
            document.removeEventListener('focusin', handleLabel);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);
};
