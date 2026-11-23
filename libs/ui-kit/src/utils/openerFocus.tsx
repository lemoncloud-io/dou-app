import * as React from 'react';

const isTextEntry = (element: HTMLElement): boolean =>
    element.isContentEditable || element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement;

export const useOpenerFocus = () => {
    const openerRef = React.useRef<HTMLElement | null>(null);

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
            if (!opener?.isConnected) return;
            const active = document.activeElement;
            if (active && active !== document.body) return;
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

export const focusFirstIfNothingFocused = (content: HTMLElement | null) => {
    queueMicrotask(() => {
        if (!content || content.contains(document.activeElement)) return;
        content.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
    });
};
