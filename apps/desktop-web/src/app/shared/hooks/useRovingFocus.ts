import { useCallback, useEffect, useRef, type FocusEvent, type KeyboardEvent, type RefObject } from 'react';

const ITEM = '[data-roving-item]';
const GROUP = '[data-roving-group]';
const ACTIONS = '[data-row-actions]';
const FOCUSABLE = 'a[href], button, input, textarea, select, [tabindex]';
const PARKED = 'data-roving-parked';

/**
 * Takes every control in the list out of the tab order except those of the current
 * item: its own controls, and its group's shared ones (a message block's author
 * name). A parked control keeps its own tabindex in `data-roving-parked` to get back.
 * Controls outside any group (the feed's own buttons) are left alone.
 */
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

/**
 * One tab stop for a long list of items (the feed's messages), with the arrow keys
 * moving between them.
 *
 * Every message, and every button in every message, was a tab stop: at 1024px the
 * composer was stop 161 of 163. Now Tab enters the list once, on the message you were
 * last on (or the newest), ↑/↓ step through messages, Home/End jump to either end, and
 * Enter moves into the message's own actions (`[data-row-actions]`). Only the current
 * message's controls are in the tab order (see `scopeTabOrder`), so Tab from it walks
 * its reactions, thread link and images, then leaves the list.
 *
 * Items are marked with `data-roving-item` and rendered with `tabIndex={-1}`, inside a
 * `data-roving-group` (a message block). The tab order is set here, on the DOM, so
 * moving it re-renders nothing.
 */
export const useRovingFocus = (rootRef: RefObject<HTMLElement | null>) => {
    const current = useRef<HTMLElement | null>(null);
    // Until the reader picks a message, the stop follows the newest one.
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

    // Every render of the list: items come and go, and the stop has to stay on one of them.
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
            // Only on the message itself: inside it, the arrows belong to whatever has focus.
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
            // onFocus moves the tab stop along.
            target.focus({ preventScroll: true });
            target.scrollIntoView?.({ block: 'nearest' });
        },
        [rootRef]
    );

    return { onFocus, onKeyDown };
};
