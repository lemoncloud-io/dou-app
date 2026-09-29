import * as React from 'react';

/**
 * Where focus goes when a dialog opens and closes, for dialogs opened without a Trigger.
 *
 * Radix returns focus to the dialog's Trigger on close. A dialog opened from state (a
 * shortcut, a tile click, a drop) has no Trigger, so focus fell to `<body>` and a keyboard
 * user was thrown back to the top of the page. The opener is remembered instead: whatever
 * held focus when the content mounted. That replaces Radix's own return to the Trigger too;
 * where there is a Trigger, it is the element that held focus. To place focus yourself on
 * close, move it in `onCloseAutoFocus` and call `preventDefault()`, or move it before then.
 *
 * Reopening during the exit animation keeps the same content mounted, and so the same opener.
 */
const isTextEntry = (element: HTMLElement): boolean =>
    element.isContentEditable || element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement;

export const useOpenerFocus = () => {
    const openerRef = React.useRef<HTMLElement | null>(null);

    /**
     * Rendered inside the content. Its layout effect runs when the content mounts and before
     * Radix moves focus into it (that happens in a passive effect), so it still sees the opener.
     * Focus already inside the content is not an opener: an `autoFocus` field gets there first,
     * and React's development double-mount runs this again after it has.
     */
    const Capture = React.useMemo(
        () =>
            function OpenerCapture() {
                const markerRef = React.useRef<HTMLSpanElement>(null);
                React.useLayoutEffect(() => {
                    const active = document.activeElement;
                    const content = markerRef.current?.parentElement;
                    if (!(active instanceof HTMLElement) || active === document.body) {
                        openerRef.current = null;
                        return;
                    }
                    if (content?.contains(active)) return;
                    openerRef.current = active;
                }, []);
                return <span ref={markerRef} hidden />;
            },
        []
    );

    const withReturn = React.useCallback(
        (handler?: (event: Event) => void) => (event: Event) => {
            handler?.(event);
            if (event.defaultPrevented) return;
            const opener = openerRef.current;
            openerRef.current = null;
            // An opener that has left the page (a removed row) has nowhere to take focus back.
            if (!opener?.isConnected) return;
            // The caller already put focus somewhere on close (the content is gone by now, so
            // anything but <body> was placed on purpose). Radix left that alone; so does this.
            const active = document.activeElement;
            if (active && active !== document.body) return;
            // On a touch screen, focusing a text field brings the keyboard back up, which a
            // phone user who just closed a sheet did not ask for.
            if (isTextEntry(opener) && window.matchMedia?.('(pointer: coarse)').matches) return;
            event.preventDefault();
            opener.focus({ preventScroll: true });
        },
        []
    );

    return { Capture, withReturn };
};

const FOCUSABLE =
    'button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])';

/**
 * An alert dialog focuses its Cancel on open. One with only an action has no Cancel, and
 * Radix then focuses nothing: the notice sat on screen while Enter and Escape still went to
 * the page behind it. This lands focus on the first control when that happened.
 */
export const focusFirstIfNothingFocused = (content: HTMLElement | null) => {
    queueMicrotask(() => {
        if (!content || content.contains(document.activeElement)) return;
        content.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
    });
};
