import { describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/data';

import { isFeedVisible } from './feedVisibility';

const chat = (over: Partial<DomainChat> = {}): DomainChat =>
    ({ id: 'C1:1', channelId: 'C1', chatNo: 1, content: 'hi', ...over }) as DomainChat;

describe('isFeedVisible', () => {
    it('keeps an ordinary top-level message', () => {
        expect(isFeedVisible(chat())).toBe(true);
    });

    it('drops a thread reply — those belong to the thread panel', () => {
        expect(isFeedVisible(chat({ parentId: 'C1:1' }))).toBe(false);
    });

    // The row stays and renders as "This message was deleted." A message that just
    // vanishes leaves the people who were reading it with no account of what happened.
    it('keeps a deleted message so the feed can say one was here', () => {
        expect(isFeedVisible(chat({ hidden: true }))).toBe(true);
    });

    it('keeps the wire form of hidden (BoolFlag 1) the same way', () => {
        expect(isFeedVisible(chat({ hidden: 1 } as unknown as Partial<DomainChat>))).toBe(true);
    });

    it('keeps a join/leave system row — it renders as a notice, not a message', () => {
        expect(isFeedVisible(chat({ stereo: 'system', subType: 'join' }))).toBe(true);
    });

    // These are the input to foldReactions, shown as chips under the message they
    // point at. As feed rows they would be empty lines.
    it('drops a reaction event', () => {
        expect(isFeedVisible(chat({ stereo: 'system', subType: 'reaction' }))).toBe(false);
    });

    // A deleted reaction event is still a reaction event: it must not become a
    // tombstone in the feed just because it was removed.
    it('drops a deleted reaction event rather than tombstoning it', () => {
        expect(isFeedVisible(chat({ stereo: 'system', subType: 'reaction', hidden: true }))).toBe(false);
    });
});
