import { describe, expect, it } from 'vitest';

import { unreadIndicator } from './unreadIndicator';

describe('unreadIndicator', () => {
    it('shows nothing when there is nothing unread', () => {
        expect(unreadIndicator({ unread: 0, isDm: false, isActive: false })).toBe('none');
        expect(unreadIndicator({ unread: 0, isDm: true, isActive: false })).toBe('none');
    });

    it('shows a dot for a channel — the count would be noise', () => {
        expect(unreadIndicator({ unread: 1, isDm: false, isActive: false })).toBe('dot');
        expect(unreadIndicator({ unread: 47, isDm: false, isActive: false })).toBe('dot');
    });

    it('shows the count for a DM — there the number is reply debt', () => {
        expect(unreadIndicator({ unread: 1, isDm: true, isActive: false })).toBe('count');
        expect(unreadIndicator({ unread: 47, isDm: true, isActive: false })).toBe('count');
    });

    it('stays silent on the open row, DM or channel', () => {
        // Pre-existing behaviour: the row you are reading never carries a badge.
        expect(unreadIndicator({ unread: 12, isDm: false, isActive: true })).toBe('none');
        expect(unreadIndicator({ unread: 12, isDm: true, isActive: true })).toBe('none');
    });

    it('treats a negative or absent count as nothing unread', () => {
        // `unreadCount` is a derived value (computeChannelUnread) and can be
        // undefined before the first sync; a row must not badge on garbage.
        expect(unreadIndicator({ unread: -3, isDm: true, isActive: false })).toBe('none');
        expect(unreadIndicator({ unread: undefined, isDm: true, isActive: false })).toBe('none');
    });
});
