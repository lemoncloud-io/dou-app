import { useCallback, useEffect, useRef, type FocusEvent, type KeyboardEvent, type RefObject } from 'react';

const ITEM = '[data-roving-item]';
const GROUP = '[data-roving-group]';
const ACTIONS = '[data-row-actions]';
const FOCUSABLE = 'a[href], button, input, textarea, select, [tabindex]';
const PARKED = 'data-roving-parked';

const scopeTabOrder = (root: HTMLElement, current: HTMLElement | null) => {
    const group = current?.closest(GROUP) ?? null;
    root.querySelectorAll<HTMLElement>(FOCUSABLE).forEach(el => {
        if (el.matches(ITEM)) return;
        const owner = el.closest(GROUP);
        if (!owner) return;
        const item = el.closest(ITEM);
        const inScope = item ? item === current : owner === group;
        if (inScope) {
            if (!el.hasAttribute(PARKED)) return;
            const original = el.getAttribute(PARKED);
            if (original) el.setAttribute('tabindex', original);
            else el.removeAttribute('tabindex');
            el.removeAttribute(PARKED);
        } else if (!el.hasAttribute(PARKED) && el.tabIndex >= 0) {
            el.setAttribute(PARKED, el.getAttribute('tabindex') ?? '');
            el.tabIndex = -1;
        }
    });
};

export const useRovingFocus = (rootRef: RefObject<HTMLElement | null>) => {
    const current = useRef<HTMLElement | null>(null);
    const chosen = useRef(false);

    const setStop = useCallback(
        (next: HTMLElement) => {
            if (current.current && current.current !== next) current.current.tabIndex = -1;
            next.tabIndex = 0;
            current.current = next;
            if (rootRef.current) scopeTabOrder(rootRef.current, next);
        },
        [rootRef]
    );

    useEffect(() => {
        const items = rootRef.current?.querySelectorAll<HTMLElement>(ITEM);
        if (!items?.length) {
            current.current = null;
            return;
        }
        const kept = chosen.current && current.current?.isConnected ? current.current : items[items.length - 1];
        items.forEach(item => {
            if (item !== kept && item.tabIndex !== -1) item.tabIndex = -1;
        });
        setStop(kept);
    });

    const onFocus = useCallback(
        (event: FocusEvent<HTMLElement>) => {
            const item = (event.target as Element).closest<HTMLElement>(ITEM);
            if (!item || !rootRef.current?.contains(item)) return;
            chosen.current = true;
            setStop(item);
        },
        [rootRef, setStop]
    );

    const onKeyDown = useCallback(
        (event: KeyboardEvent<HTMLElement>) => {
            const item = event.target as HTMLElement;
            if (event.defaultPrevented || !item.matches?.(ITEM)) return;
            if (event.key === 'Enter') {
                const first = item.querySelector<HTMLElement>(`${ACTIONS} button:not([disabled])`);
                if (!first) return;
                event.preventDefault();
                first.focus();
                return;
            }
            const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);
            const at = items.indexOf(item);
            const target =
                event.key === 'ArrowUp'
                    ? items[at - 1]
                    : event.key === 'ArrowDown'
                      ? items[at + 1]
                      : event.key === 'Home'
                        ? items[0]
                        : event.key === 'End'
                          ? items[items.length - 1]
                          : undefined;
            if (!target) return;
            event.preventDefault();
            target.focus({ preventScroll: true });
            target.scrollIntoView?.({ block: 'nearest' });
        },
        [rootRef]
    );

    return { onFocus, onKeyDown };
};
