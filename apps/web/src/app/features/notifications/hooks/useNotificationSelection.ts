import { useCallback, useMemo, useState } from 'react';

import type { NotificationItem } from '../../../utils/notifications';

/** The quick-select chips of selection mode, in display order. */
export const QUICK_SELECTIONS = ['all', 'unread', 'read'] as const;
export type QuickSelection = (typeof QUICK_SELECTIONS)[number];

const pick = (items: readonly NotificationItem[], quick: QuickSelection): string[] =>
    items.filter(item => (quick === 'all' ? true : quick === 'unread' ? !item.read : item.read)).map(item => item.id);

const sameSet = (a: ReadonlySet<string>, b: readonly string[]): boolean =>
    a.size === b.length && b.every(id => a.has(id));

/**
 * Selection mode of a notification list. Entered from the header or by a long press — a long-pressed
 * row starts picked. A quick-select chip picks every visible item it names at once and, pressed
 * again while that is exactly the selection, clears it. Rows still toggle one by one after.
 */
export const useNotificationSelection = (visible: readonly NotificationItem[]) => {
    const [active, setActive] = useState(false);
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

    const enter = useCallback((id?: string) => {
        setActive(true);
        setSelected(new Set(id ? [id] : []));
    }, []);
    const exit = useCallback(() => {
        setActive(false);
        setSelected(new Set());
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
    const quickSelect = useCallback(
        (quick: QuickSelection) =>
            setSelected(prev => {
                const ids = pick(visible, quick);
                return sameSet(prev, ids) ? new Set() : new Set(ids);
            }),
        [visible]
    );
    /** The quick chip whose set is exactly the selection, drawn pressed. */
    const pressedQuick = useMemo(
        () => QUICK_SELECTIONS.find(quick => selected.size > 0 && sameSet(selected, pick(visible, quick))),
        [selected, visible]
    );
    // Only what is still visible counts — a filter or tab change can hide a picked item.
    const selectedItems = useMemo(() => visible.filter(item => selected.has(item.id)), [visible, selected]);

    return { active, selected, selectedItems, pressedQuick, enter, exit, toggle, quickSelect };
};
