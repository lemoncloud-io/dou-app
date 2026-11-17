import { act, renderHook } from '@testing-library/react';

import type { NotificationItem } from '../../../utils/notifications';
import { pickedIn, useNotificationSelection, withHeld } from './useNotificationSelection';

const item = (id: string, read: boolean, createdAt = 1): NotificationItem => ({
    id,
    cloudId: 'c',
    channelId: 'ch',
    kind: 'mention',
    ownerName: 'Sis',
    content: 'hi',
    createdAt,
    read,
});
const ITEMS = [item('a', false), item('b', true), item('c', false)];
const IDS = ITEMS.map(it => it.id);

describe('useNotificationSelection', () => {
    it('starts with the long-pressed item picked, and toggles rows one by one', () => {
        const { result } = renderHook(() => useNotificationSelection());
        act(() => result.current.enter('a'));
        expect(result.current.active).toBe(true);
        expect([...result.current.selected]).toEqual(['a']);

        act(() => result.current.toggle('b'));
        act(() => result.current.toggle('a'));
        expect([...result.current.selected]).toEqual(['b']);
    });

    it('selects all, and clears when pressed again on exactly that set', () => {
        const { result } = renderHook(() => useNotificationSelection());
        act(() => result.current.enter());

        act(() => result.current.toggleAll(IDS));
        expect([...result.current.selected].sort()).toEqual(IDS);

        act(() => result.current.toggleAll(IDS));
        expect(result.current.selected.size).toBe(0);
    });

    it('selects all from a partial pick rather than clearing it', () => {
        const { result } = renderHook(() => useNotificationSelection());
        act(() => result.current.enter('a'));

        act(() => result.current.toggleAll(IDS));
        expect([...result.current.selected].sort()).toEqual(IDS);
    });

    it('holds items until the mode closes, and a new entry starts with nothing held', () => {
        const { result } = renderHook(() => useNotificationSelection());
        act(() => result.current.enter('a'));
        act(() => result.current.hold(['a']));
        act(() => result.current.hold(['c']));
        expect([...result.current.held].sort()).toEqual(['a', 'c']);

        act(() => result.current.exit());
        expect(result.current.active).toBe(false);
        expect(result.current.selected.size).toBe(0);
        expect(result.current.held.size).toBe(0);

        act(() => result.current.hold(['a']));
        act(() => result.current.enter());
        expect(result.current.held.size).toBe(0);
    });
});

describe('withHeld', () => {
    const pool = [item('new', true, 3), item('mid', false, 2), item('old', true, 1)];

    it('puts held items of the pool back, newest first', () => {
        const listed = [pool[1]];
        expect(withHeld(listed, pool, new Set(['new', 'old'])).map(it => it.id)).toEqual(['new', 'mid', 'old']);
    });

    it('leaves the list as it is with nothing held, or nothing held missing from it', () => {
        expect(withHeld([pool[1]], pool, new Set()).map(it => it.id)).toEqual(['mid']);
        expect(withHeld([pool[1]], pool, new Set(['mid'])).map(it => it.id)).toEqual(['mid']);
    });

    it('does not bring back a held item that has left the pool (deleted)', () => {
        expect(withHeld([pool[1]], [pool[1]], new Set(['new'])).map(it => it.id)).toEqual(['mid']);
    });
});

describe('pickedIn', () => {
    it('counts only picks still visible, and the unread among them for "mark as read"', () => {
        const picked = pickedIn([ITEMS[0], ITEMS[1]], new Set(['a', 'b', 'c']));
        expect(picked.ids).toEqual(['a', 'b']);
        expect(picked.unreadIds).toEqual(['a']);
        expect(picked.all).toBe(true);
    });

    it('has nothing to mark read when every pick is read, and is not "all" with an unpicked row', () => {
        const picked = pickedIn(ITEMS, new Set(['b']));
        expect(picked.unreadIds).toEqual([]);
        expect(picked.all).toBe(false);
    });

    it('is not "all" on an empty list', () => {
        expect(pickedIn([], new Set()).all).toBe(false);
    });
});
