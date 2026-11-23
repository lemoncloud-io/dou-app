import { useEffect } from 'react';

const NON_TEXT_INPUT_TYPES = new Set(['hidden', 'file', 'checkbox', 'radio', 'button', 'submit', 'range', 'color']);

const isEditableTextElement = (el: Element | null): el is HTMLElement => {
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(el.type);
    return false;
};

const isAutoScrollExcluded = (el: Element): boolean => !!el.closest('[data-no-autoscroll]');

const keyboardHeight = (): number =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height')) || 0;

const visibleBand = (el: HTMLElement): { top: number; bottom: number } => {
    const vv = window.visualViewport;
    let top = vv ? vv.offsetTop : 0;
    let bottom = Math.min(top + (vv ? vv.height : window.innerHeight), window.innerHeight - keyboardHeight());

    el.closest('[data-chrome-root]')
        ?.querySelectorAll<HTMLElement>('[data-chrome-overlay]')
        .forEach(overlay => {
            const rect = overlay.getBoundingClientRect();
            if (rect.height === 0) return;
            if (overlay.dataset.chromeOverlay === 'top') top = Math.max(top, rect.bottom);
            else bottom = Math.min(bottom, rect.top);
        });

    return { top, bottom };
};

const findScroller = (el: HTMLElement): HTMLElement | null => {
    for (let node = el.parentElement; node; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        const scrollable = overflowY === 'auto' || overflowY === 'scroll';
        if (scrollable && node.scrollHeight > node.clientHeight) return node;
    }
    return null;
};

export const useAutoScrollOnFocus = () => {
    useEffect(() => {
        if (typeof navigator === 'undefined' || navigator.maxTouchPoints === 0) return;

        let timer: ReturnType<typeof setTimeout> | undefined;

        const handleFocusIn = (event: FocusEvent) => {
            const target = event.target as Element | null;
            if (!isEditableTextElement(target)) return;
            if (isAutoScrollExcluded(target)) return;

            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                if (document.activeElement !== target) return;

                const band = visibleBand(target);
                const rect = target.getBoundingClientRect();
                if (rect.top >= band.top && rect.bottom <= band.bottom) return;

                const delta = rect.top + rect.height / 2 - (band.top + band.bottom) / 2;
                const scroller = findScroller(target);
                if (scroller) scroller.scrollBy({ top: delta, behavior: 'smooth' });
                else window.scrollBy({ top: delta, behavior: 'smooth' });
            }, 300);
        };

        document.addEventListener('focusin', handleFocusIn);
        return () => {
            if (timer) clearTimeout(timer);
            document.removeEventListener('focusin', handleFocusIn);
        };
    }, []);
};
