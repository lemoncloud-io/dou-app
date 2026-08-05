import { describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/data';

import { isEdited } from './isEdited';

const chat = (over: Partial<DomainChat> = {}): DomainChat =>
    ({ id: 'C1:1', channelId: 'C1', chatNo: 1, content: 'hi', createdAt: 1_000, updatedAt: 1_000, ...over }) as DomainChat;

describe('isEdited', () => {
    it('says nothing about a message that has not been touched since it was sent', () => {
        expect(isEdited(chat())).toBe(false);
    });

    it('marks a message whose updatedAt has moved past createdAt', () => {
        expect(isEdited(chat({ updatedAt: 2_000 }))).toBe(true);
    });

    // The server's delete is a PUT on the same row, so it moves updatedAt too. That row
    // renders as a tombstone, and "This message was deleted. (edited)" is nonsense.
    it('does not mark a deleted message', () => {
        expect(isEdited(chat({ updatedAt: 2_000, hidden: true }))).toBe(false);
    });

    // An optimistic row is stamped locally and has not been near the server yet.
    it('does not mark a message that is still in flight', () => {
        expect(isEdited(chat({ updatedAt: 2_000, isPending: true }))).toBe(false);
    });

    it('does not guess when the timestamps are missing', () => {
        expect(isEdited(chat({ createdAt: undefined, updatedAt: 2_000 }))).toBe(false);
        expect(isEdited(chat({ updatedAt: undefined }))).toBe(false);
    });
});
