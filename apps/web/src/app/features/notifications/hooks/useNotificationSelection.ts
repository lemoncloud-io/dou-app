import { useCallback, useState } from 'react';

import { newestFirst, type NotificationItem } from '../../../utils/notifications';

const sameSet = (a: ReadonlySet<string>, b: readonly string[]): boolean =>
    a.size === b.length && b.every(id => a.has(id));

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
    const toggleAll = useCallback(
        (ids: readonly string[]) => setSelected(prev => (sameSet(prev, ids) ? new Set() : new Set(ids))),
        []
    );
    const hold = useCallback((ids: readonly string[]) => setHeld(prev => new Set([...prev, ...ids])), []);

    return { active, selected, held, enter, exit, toggle, toggleAll, hold };
};

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

export const pickedIn = (visible: readonly NotificationItem[], selected: ReadonlySet<string>) => {
    const items = visible.filter(item => selected.has(item.id));
    return {
        items,
        ids: items.map(item => item.id),
        unreadIds: items.filter(item => !item.read).map(item => item.id),
        all: visible.length > 0 && items.length === visible.length,
    };
};
