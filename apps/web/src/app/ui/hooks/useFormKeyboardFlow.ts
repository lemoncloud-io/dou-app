import { useEffect } from 'react';

// Focusable text controls inside a form container, excluding no-autoscroll elements
// (e.g. the chat composer). Single-line inputs get Enter-to-advance; textareas keep newlines.
const FIELD_SELECTOR = 'input:not([type=hidden]):not([type=file]):not([disabled]), textarea';

const collectFields = (container: HTMLElement): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter(
        el => !el.closest('[data-no-autoscroll]')
    );

/**
 * Wires the soft-keyboard return key to advance between the text fields inside `containerRef`,
 * in DOM order. Sets `enterKeyHint` to `next` on every field except the last, and `done` on the
 * last. On Enter (respecting IME composition) a single-line `<input>` moves focus to the next
 * field, or blurs itself when it is the last one; `<textarea>` keeps its native newline behavior.
 */
export const useFormKeyboardFlow = (containerRef: React.RefObject<HTMLElement | null>) => {
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const applyHints = () => {
            const fields = collectFields(container);
            fields.forEach((field, index) => {
                (field as HTMLInputElement | HTMLTextAreaElement).enterKeyHint =
                    index === fields.length - 1 ? 'done' : 'next';
            });
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' || event.isComposing) return;

            const target = event.target as HTMLElement | null;
            // Leave newline behavior intact for multi-line textareas.
            if (!target || target instanceof HTMLTextAreaElement) return;
            if (!(target instanceof HTMLInputElement)) return;

            const fields = collectFields(container);
            const index = fields.indexOf(target);
            if (index === -1) return;

            event.preventDefault();
            const next = fields[index + 1];
            if (next) {
                next.focus();
            } else {
                target.blur();
            }
        };

        applyHints();

        // Keep hints in sync as fields are added/removed (e.g. conditional inputs).
        const observer = new MutationObserver(applyHints);
        observer.observe(container, { childList: true, subtree: true });
        container.addEventListener('keydown', handleKeyDown);

        return () => {
            observer.disconnect();
            container.removeEventListener('keydown', handleKeyDown);
        };
    }, [containerRef]);
};
