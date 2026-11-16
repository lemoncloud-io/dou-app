import { act, renderHook } from '@testing-library/react';

import type { NotificationItem } from '../../../utils/notifications';
import { useNotificationSelection } from './useNotificationSelection';

const item = (id: string, read: boolean): NotificationItem => ({
    id,
    cloudId: 'c',
    channelId: 'ch',
    kind: 'mention',
    ownerName: 'Sis',
    content: 'hi',
    createdAt: 1,
    read,
});
const ITEMS = [item('a', false), item('b', true), item('c', false)];

describe('useNotificationSelection', () => {
    it('starts with the long-pressed item picked, and toggles rows one by one', () => {
        const { result } = renderHook(() => useNotificationSelection(ITEMS));
        act(() => result.current.enter('a'));
        expect(result.current.active).toBe(true);
        expect([...result.current.selected]).toEqual(['a']);

        act(() => result.current.toggle('b'));
        act(() => result.current.toggle('a'));
        expect([...result.current.selected]).toEqual(['b']);
    });

    it('quick-selects what it names, and clears when pressed again on the same set', () => {
        const { result } = renderHook(() => useNotificationSelection(ITEMS));
        act(() => result.current.enter());

        act(() => result.current.quickSelect('unread'));
        expect([...result.current.selected].sort()).toEqual(['a', 'c']);
        expect(result.current.pressedQuick).toBe('unread');

        act(() => result.current.quickSelect('unread'));
        expect(result.current.selected.size).toBe(0);
        expect(result.current.pressedQuick).toBeUndefined();

        act(() => result.current.quickSelect('read'));
        expect([...result.current.selected]).toEqual(['b']);
    });

    it('counts only picked items that are still visible, and empties on exit', () => {
        const { result, rerender } = renderHook(({ items }) => useNotificationSelection(items), {
            initialProps: { items: ITEMS },
        });
        act(() => result.current.quickSelect('all'));
        rerender({ items: [ITEMS[0]] });
        expect(result.current.selectedItems.map(it => it.id)).toEqual(['a']);

        act(() => result.current.exit());
        expect(result.current.active).toBe(false);
        expect(result.current.selected.size).toBe(0);
    });
});
