import { beforeEach, describe, expect, it } from 'vitest';

import {
    countUnreadMentionsIn,
    hasUnreadMentionIn,
    useMentionsStore,
    type MentionItem,
} from './useMentionsStore';

const item = (fields: Partial<MentionItem>): MentionItem => ({
    id: 'C1:5',
    channelId: 'C1',
    placeId: 'place-1',
    chatNo: 5,
    content: '@Me hi',
    ownerName: 'Ada',
    createdAt: 1,
    ...fields,
});

const C1 = { id: 'C1', placeId: 'place-1' };

const inbox = (...items: MentionItem[]) => Object.fromEntries(items.map(entry => [entry.id, entry]));

describe('hasUnreadMentionIn', () => {
    it('finds a mention past what I have read in the channel', () => {
        expect(hasUnreadMentionIn(inbox(item({})), C1, 4)).toBe(true);
    });

    it('does not count a mention I have read up to in the channel', () => {
        expect(hasUnreadMentionIn(inbox(item({})), C1, 5)).toBe(false);
    });

    it('does not count a mention opened from the inbox', () => {
        expect(hasUnreadMentionIn(inbox(item({ readAt: 2 })), C1, 0)).toBe(false);
    });

    it("does not count another channel's mention", () => {
        expect(hasUnreadMentionIn(inbox(item({ channelId: 'C2' })), C1, 0)).toBe(false);
    });

    // Channel ids are numbered per place, and the inbox holds every place's mentions.
    it('does not count a mention from the channel of the same id in another place', () => {
        expect(hasUnreadMentionIn(inbox(item({ placeId: 'place-2' })), C1, 0)).toBe(false);
    });

    // Without a number there is no telling whether I have read past it.
    it('does not count a mention that has no number', () => {
        expect(hasUnreadMentionIn(inbox(item({ chatNo: undefined })), C1, 0)).toBe(false);
    });
});

describe('countUnreadMentionsIn', () => {
    it('counts unread mentions past the read boundary', () => {
        const entries = inbox(item({ id: 'C1:5' }), item({ id: 'C1:6', chatNo: 6 }), item({ id: 'C1:4', chatNo: 4 }));
        expect(countUnreadMentionsIn(entries, C1, 4)).toBe(2);
    });

    it('leaves out mentions opened from the inbox', () => {
        expect(countUnreadMentionsIn(inbox(item({ readAt: 2 })), C1, 0)).toBe(0);
    });

    it('leaves out mentions at or below the read boundary', () => {
        expect(countUnreadMentionsIn(inbox(item({})), C1, 5)).toBe(0);
    });

    it('leaves out another place’s channel of the same id', () => {
        expect(countUnreadMentionsIn(inbox(item({ placeId: 'place-2' })), C1, 0)).toBe(0);
    });
});

describe('markChannelRead', () => {
    beforeEach(() => {
        useMentionsStore.setState({ items: {} });
    });

    const seed = () =>
        useMentionsStore.setState({
            items: inbox(
                item({ id: 'C1:5', chatNo: 5 }),
                item({ id: 'C1:6', chatNo: 6 }),
                item({ id: 'C2:5', channelId: 'C2', chatNo: 5 })
            ),
        });
    const readAtOf = (id: string) => useMentionsStore.getState().items[id]?.readAt;

    it('marks mentions at or below the cursor read and leaves newer ones', () => {
        seed();
        useMentionsStore.getState().markChannelRead('C1', 5);
        expect(readAtOf('C1:5')).toBeDefined();
        expect(readAtOf('C1:6')).toBeUndefined();
    });

    it('leaves other channels alone', () => {
        seed();
        useMentionsStore.getState().markChannelRead('C1', 9);
        expect(readAtOf('C2:5')).toBeUndefined();
    });

    it('stamps once — a second advance does not rewrite the mark', () => {
        seed();
        useMentionsStore.getState().markChannelRead('C1', 5);
        const first = readAtOf('C1:5');
        useMentionsStore.getState().markChannelRead('C1', 6);
        expect(readAtOf('C1:5')).toBe(first);
        expect(readAtOf('C1:6')).toBeDefined();
    });

    it('no-ops on a channel with no inbox items', () => {
        seed();
        expect(() => useMentionsStore.getState().markChannelRead('C9', 9)).not.toThrow();
        expect(Object.keys(useMentionsStore.getState().items)).toHaveLength(3);
    });

    it('does not stamp the same channel id in another place', () => {
        useMentionsStore.setState({ items: inbox(item({ id: 'C1:5', placeId: 'place-2' })) });
        useMentionsStore.getState().markChannelRead('C1', 9, 'place-1');
        expect(useMentionsStore.getState().items['C1:5']?.readAt).toBeUndefined();
    });
});
