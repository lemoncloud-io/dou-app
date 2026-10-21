import { describe, expect, it } from 'vitest';

import type { DomainChannel } from '@chatic/data';

import { hasUnreadDm, hasUnreadRoom } from './dmBucket';

const room = (over: Partial<DomainChannel>) =>
    ({ id: 'c', name: 'general', stereo: 'public', ...over }) as DomainChannel;

describe('hasUnreadRoom', () => {
    it('is true while a channel holds unread messages', () => {
        expect(hasUnreadRoom([room({ unreadCount: 0 }), room({ id: 'd', unreadCount: 2 })])).toBe(true);
    });

    it('leaves out an unread DM or notes-to-self room', () => {
        expect(
            hasUnreadRoom([room({ stereo: 'dm', name: '', unreadCount: 4 }), room({ stereo: 'self', unreadCount: 1 })])
        ).toBe(false);
    });

    it('is false when everything is read', () => {
        expect(hasUnreadRoom([room({ unreadCount: 0 }), room({ id: 'd' })])).toBe(false);
    });
});

describe('hasUnreadDm', () => {
    it('is true while a 1:1 or the notes-to-self room holds unread messages', () => {
        expect(hasUnreadDm([room({ stereo: 'dm', name: '', unreadCount: 1 })])).toBe(true);
        expect(hasUnreadDm([room({ stereo: 'self', unreadCount: 1 })])).toBe(true);
    });

    it('leaves out an unread channel', () => {
        expect(hasUnreadDm([room({ unreadCount: 3 }), room({ id: 'd', stereo: 'dm', name: '' })])).toBe(false);
    });
});
