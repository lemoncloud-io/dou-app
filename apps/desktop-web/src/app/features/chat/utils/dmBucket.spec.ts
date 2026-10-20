import { describe, expect, it } from 'vitest';

import type { DomainChannel } from '@chatic/data';

import { hasUnreadRoom } from './dmBucket';

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
