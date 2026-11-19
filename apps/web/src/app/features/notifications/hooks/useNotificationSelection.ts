import { useCallback, useState } from 'react';

import { newestFirst, type NotificationItem } from '../../../utils/notifications';

const sameSet = (a: ReadonlySet<string>, b: readonly string[]): boolean =>
    a.size === b.length && b.every(id => a.has(id));

/**
 * Selection mode of a notification list. Entered from the header or by a long press — a long-pressed
 * row starts picked. "Select all" picks every visible item and, pressed again while that is exactly
 * the selection, clears it; rows toggle one by one. There is no "unread" or "read" quick pick: the
 * bar's "mark as read" counts the unread among what is picked instead.
 *
 * Marking read keeps the mode and the picks, so the same items can be deleted next. A list that
 * drops read items (the find-me sheet, the "unread only" filter) would take them away at that
 * moment, so the host passes them to `hold` and draws its list through {@link withHeld} until the
 * mode closes.
 *
 * The hook holds state only. What is visible depends on what is held, so the host works its list
 * out after calling this and reads the picks against it with {@link pickedIn}.
 */
export const useNotificationSelection = () => {
    const [active, setActive] = useState(false);
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
    const [held, setHeld] = useState<ReadonlySet<string>>(new Set());

    const enter = useCallback((id?: string) => {
        setActive(true);
        setSelected(new Set(id ? [id] : []));
        setHeld(new Set());
    }, []);
    const exit = useCallback(() => {
        setActive(false);
        setSelected(new Set());
        setHeld(new Set());
    }, []);
    const toggle = useCallback(
        (id: string) =>
            setSelected(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            }),
        []
    );
    /** "Select all" over `ids` (what is visible): picks them all, or clears when that is already the selection. */
    const toggleAll = useCallback(
        (ids: readonly string[]) => setSelected(prev => (sameSet(prev, ids) ? new Set() : new Set(ids))),
        []
    );
    /** Keeps `ids` on the list while the mode lasts, read or not. */
    const hold = useCallback((ids: readonly string[]) => setHeld(prev => new Set([...prev, ...ids])), []);

    return { active, selected, held, enter, exit, toggle, toggleAll, hold };
};

/**
 * `listed` with the held items of `pool` put back, newest first. An item that has left `pool` — deleted,
 * or out of scope — stays gone.
 */
export const withHeld = (
    listed: readonly NotificationItem[],
    pool: readonly NotificationItem[],
    held: ReadonlySet<string>
): NotificationItem[] => {
    if (held.size === 0) return [...listed];
    const shown = new Set(listed.map(item => item.id));
    const back = pool.filter(item => held.has(item.id) && !shown.has(item.id));
    return back.length === 0 ? [...listed] : newestFirst([...listed, ...back]);
};

/** What the picks mean against the list on screen: only picked items still visible count. */
export const pickedIn = (visible: readonly NotificationItem[], selected: ReadonlySet<string>) => {
    const items = visible.filter(item => selected.has(item.id));
    return {
        items,
        ids: items.map(item => item.id),
        /** The picked items "mark as read" applies to — and counts. */
        unreadIds: items.filter(item => !item.read).map(item => item.id),
        /** Every visible item is picked — "Select all" draws pressed. */
        all: visible.length > 0 && items.length === visible.length,
    };
};
