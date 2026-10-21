import { useEffect } from 'react';

import { typesOnSoftKeyboard } from '../../utils/softKeyboard';

// Input types that never receive a soft keyboard and so have no return key.
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

// The fields of one form are the ones sharing the nearest of these. A sheet or dialog portals out of
// the page, so without its own scope the page's fields behind it would count as its neighbours.
const SCOPE_SELECTOR = '[role="dialog"], [role="alertdialog"], form';

const FIELD_SELECTOR = 'input, textarea';

/**
 * Marks a group of inputs that reads as one field — the one-character cells of a verification code.
 * Return on any cell acts as return on the group: it moves past the whole group, or finishes it.
 */
const RETURN_KEY_UNIT_ATTR = 'data-return-key-unit';

const isTextInput = (el: Element): el is HTMLInputElement =>
    el instanceof HTMLInputElement && !NON_TEXT_INPUT_TYPES.has(el.type);

// The chat composer marks itself no-autoscroll; its return key is the room's to decide (send or
// newline), so this flow never touches it.
const isExcluded = (el: Element): boolean => !!el.closest('[data-no-autoscroll]');

// A field that is not laid out (display:none), is invisible (visibility:hidden) or sits in an inert
// subtree cannot take focus, and moving to it would leave the keyboard up with nothing focused.
// `checkVisibility` is missing on older WebViews; there the layout check stands alone.
const isFocusable = (el: HTMLInputElement | HTMLTextAreaElement): boolean =>
    !el.disabled &&
    !el.readOnly &&
    !el.closest('[inert]') &&
    el.getClientRects().length > 0 &&
    el.checkVisibility?.({ visibilityProperty: true }) !== false;

const scopeOf = (el: Element): Element | null => el.closest(SCOPE_SELECTOR);

/**
 * The positions of the form `field` belongs to, in DOM order. Each position is a list because a
 * {@link RETURN_KEY_UNIT_ATTR} group is one position holding several inputs. A textarea is a
 * position too — the input before it advances into it — but a search box is not: it stands alone.
 */
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

/** The first field of the position after `field`'s, or `null` when `field` is in the last one. */
const nextFieldAfter = (field: Element): HTMLElement | null => {
    const positions = positionsAround(field);
    const index = positions.findIndex(position => position.includes(field));
    if (index === -1) return null;
    return (positions[index + 1]?.[0] as HTMLElement | undefined) ?? null;
};

// A text input this flow owns: not the composer, not a search box (which keeps the platform's own
// search key), and not a textarea (whose return key is a newline).
const isFlowInput = (el: EventTarget | null): el is HTMLInputElement =>
    el instanceof Element && isTextInput(el) && el.type !== 'search' && !isExcluded(el);

const applyHint = (input: HTMLInputElement) => {
    input.setAttribute('enterkeyhint', nextFieldAfter(input) ? 'next' : 'done');
};

/**
 * One rule for the soft keyboard's return key on every screen, mounted once at the app root. It
 * applies only where typing happens on the soft keyboard; a hardware keyboard (a desktop browser,
 * the iOS app on a Mac, an iPad on a trackpad) keeps the browser's own Enter, form submit included.
 *
 *
 * - a text input with another field after it in the same form shows **next**, and return moves the
 *   cursor there;
 * - a single input, or the last one, shows **done**, and return closes the keyboard (blur);
 * - a search box keeps the platform's search key, and return closes the keyboard after the page's
 *   own handler has run the search;
 * - a textarea keeps return as a newline, and the chat and thread composers are left alone.
 *
 * The label is set when the field is pressed or focused rather than by watching the DOM: fields
 * appear and disappear (a code field once a code is sent), and only the focused field's label is on
 * screen. Return is handled on `document` in the bubble phase, after React's own handlers, so a
 * screen that has to own return for one field can `preventDefault()` and this flow steps aside.
 */
export const useReturnKeyFlow = () => {
    useEffect(() => {
        // `pointerdown` labels the field before the tap focuses it, so the keyboard comes up with the
        // right key; `focusin` covers focus that arrives without a press (autofocus, our own moves).
        const handleLabel = (event: Event) => {
            if (isFlowInput(event.target) && typesOnSoftKeyboard()) applyHint(event.target);
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' || event.defaultPrevented) return;
            // keyCode 229 is the IME's own keydown on WebKit, where `isComposing` can already be false.
            if (event.isComposing || event.keyCode === 229) return;
            if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;

            const target = event.target;
            if (!(target instanceof Element) || !isTextInput(target) || isExcluded(target)) return;
            if (!typesOnSoftKeyboard()) return;

            // Also stops a form's implicit submit: return finishes typing, the button submits.
            event.preventDefault();
            // Act on the key the keyboard is showing, not on the form as it is now. A field can be
            // enabled after the label was set (a code field once a code is sent), and the keyboard
            // does not redraw its key while the field keeps focus: a "done" key that then moved the
            // cursor would do something other than what it says.
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
