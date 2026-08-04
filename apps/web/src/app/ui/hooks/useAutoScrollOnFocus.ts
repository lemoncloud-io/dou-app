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

/**
 * Height the soft keyboard covers, per the `--keyboard-height` the native WebView injects. Absent in
 * a plain browser, where it reads as 0.
 */
const keyboardHeight = (): number =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height')) || 0;

/**
 * The band `el` must sit inside to count as readable: the viewport minus the soft keyboard and the
 * docked chrome overlapping its edges.
 *
 * Layouts like KeyboardAwareLayout float the header and the CTA panel ON TOP of the scrolled body,
 * so a field can be well inside the viewport and still be covered by one — exactly the case a plain
 * viewport test misses. Only the field's OWN scaffold counts: a bottom sheet over such a page has
 * no chrome root of its own, and the page's CTA behind it must not shrink the sheet's band.
 *
 * The keyboard is floored in as a `min`, not subtracted: where `visualViewport` already reports the
 * shrink the two agree, and where the WebView leaves the viewport alone (it injects the var instead
 * of firing `resize`) this is the only signal there is. A sheet, which has no chrome root to shrink
 * its band, would otherwise count a field buried under the keyboard as readable.
 */
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

// Nearest ancestor that can actually be scrolled; `null` means the page itself scrolls.
const findScroller = (el: HTMLElement): HTMLElement | null => {
    for (let node = el.parentElement; node; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        const scrollable = overflowY === 'auto' || overflowY === 'scroll';
        if (scrollable && node.scrollHeight > node.clientHeight) return node;
    }
    return null;
};

/**
 * Global focus-scroll behavior. When a text field is focused (soft keyboard rising), centre it in
 * the readable band after a short delay so it stays clear of both the keyboard and any docked
 * header/CTA. Touch-only (gated by `navigator.maxTouchPoints`) so desktop typing does not jump.
 * Native WebViews inject keyboard/safe-area CSS vars; in a plain browser the keyboard never rises
 * so the band is the whole viewport and an already-visible field is left alone.
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

                const band = visibleBand(target);
                const rect = target.getBoundingClientRect();
                if (rect.top >= band.top && rect.bottom <= band.bottom) return;

                // Scroll by the measured offset rather than `scrollIntoView({ block: 'center' })`:
                // that centres the field in the SCROLLER's box, which runs under the keyboard and
                // the docked CTA. Centring it in the band puts it where it is actually readable.
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
