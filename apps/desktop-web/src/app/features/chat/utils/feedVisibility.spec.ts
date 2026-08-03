import { describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/data';

import { isDeletedThreadRoot, isFeedVisible } from './feedVisibility';

const chat = (over: Partial<DomainChat> = {}): DomainChat =>
    ({ id: 'C1:1', channelId: 'C1', chatNo: 1, content: 'hi', ...over }) as DomainChat;

describe('isFeedVisible', () => {
    it('keeps an ordinary top-level message', () => {
        expect(isFeedVisible(chat())).toBe(true);
    });

    it('drops a thread reply — those belong to the thread panel', () => {
        expect(isFeedVisible(chat({ parentId: 'C1:1' }))).toBe(false);
    });

    it('drops a soft-deleted message so the server row matches the optimistic removal', () => {
        expect(isFeedVisible(chat({ hidden: true }))).toBe(false);
    });

    it('treats the wire form of hidden (BoolFlag 1) as deleted', () => {
        expect(isFeedVisible(chat({ hidden: 1 } as unknown as Partial<DomainChat>))).toBe(false);
    });

    it('keeps a join/leave system row — it renders as a notice, not a message', () => {
        expect(isFeedVisible(chat({ stereo: 'system', subType: 'join' }))).toBe(true);
    });
});

describe('isDeletedThreadRoot', () => {
    const withReplies = new Map([['4', { count: 2 }]]);

    it('holds the place of a deleted message that has replies', () => {
        expect(isDeletedThreadRoot(chat({ chatNo: 4, hidden: true }), withReplies)).toBe(true);
    });

    it('lets a deleted message with no replies disappear like any other', () => {
        expect(isDeletedThreadRoot(chat({ chatNo: 9, hidden: true }), withReplies)).toBe(false);
    });

    it('does not apply to a message that is still there', () => {
        expect(isDeletedThreadRoot(chat({ chatNo: 4 }), withReplies)).toBe(false);
    });

    it('does not apply to a deleted reply — only roots anchor a thread', () => {
        expect(isDeletedThreadRoot(chat({ chatNo: 4, hidden: true, parentId: '1' }), withReplies)).toBe(false);
    });
});
