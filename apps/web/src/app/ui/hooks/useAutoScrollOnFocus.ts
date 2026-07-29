import { useEffect } from 'react';

// Input types that never receive a soft keyboard and should be ignored.
const NON_TEXT_INPUT_TYPES = new Set(['hidden', 'file', 'checkbox', 'radio', 'button', 'submit', 'range', 'color']);

const isEditableTextElement = (el: Element | null): el is HTMLElement => {
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(el.type);
    return false;
};

// Skip elements the composer workstream marked as no-autoscroll (e.g. the chat MessageInput).
const isAutoScrollExcluded = (el: Element): boolean => !!el.closest('[data-no-autoscroll]');

// Consider the element already visible when its box sits within the visual viewport.
const isFullyVisible = (el: HTMLElement): boolean => {
    const rect = el.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewportTop = vv ? vv.offsetTop : 0;
    const viewportHeight = vv ? vv.height : window.innerHeight;
    return rect.top >= viewportTop && rect.bottom <= viewportTop + viewportHeight;
};

/**
 * Global focus-scroll behavior. When a text field is focused (soft keyboard rising),
 * scroll it to the center of the viewport after a short delay so it stays visible above
 * the keyboard. Touch-only (gated by `navigator.maxTouchPoints`) so desktop typing does
 * not jump. Native WebViews inject keyboard/safe-area CSS vars; in a plain browser the
 * keyboard never rises so nothing meaningful happens.
 */
export const useAutoScrollOnFocus = () => {
    useEffect(() => {
        // Touch devices only; desktop keeps its native caret-into-view behavior.
        if (typeof navigator === 'undefined' || navigator.maxTouchPoints === 0) return;

        let timer: ReturnType<typeof setTimeout> | undefined;

        const handleFocusIn = (event: FocusEvent) => {
            const target = event.target as Element | null;
            if (!isEditableTextElement(target)) return;
            if (isAutoScrollExcluded(target)) return;

            if (timer) clearTimeout(timer);
            // Delay so the keyboard finishes animating in before we measure/scroll.
            timer = setTimeout(() => {
                if (document.activeElement !== target) return;
                if (isFullyVisible(target)) return;
                target.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }, 300);
        };

        document.addEventListener('focusin', handleFocusIn);
        return () => {
            if (timer) clearTimeout(timer);
            document.removeEventListener('focusin', handleFocusIn);
        };
    }, []);
};
