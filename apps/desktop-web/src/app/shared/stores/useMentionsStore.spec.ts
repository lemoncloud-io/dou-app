import { beforeEach, describe, expect, it } from 'vitest';

import {
    hasUnreadMentionIn,
    inboxItemId,
    keepCloudItems,
    useMentionsStore,
    type MentionItem,
} from './useMentionsStore';

const item = (fields: Partial<MentionItem>): MentionItem => ({
    id: 'C1:5',
    cloudId: 'cloud-a',
    channelId: 'C1',
    placeId: 'place-1',
    chatNo: 5,
    content: '@Me hi',
    ownerName: 'Ada',
    createdAt: 1,
    ...fields,
});

const C1 = { cloudId: 'cloud-a', id: 'C1', placeId: 'place-1' };

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

    // Every cloud numbers its places and channels from the same start.
    it('does not count a mention from the same channel and place ids in another cloud', () => {
        expect(hasUnreadMentionIn(inbox(item({ cloudId: 'cloud-b' })), C1, 0)).toBe(false);
    });

    // Without a number there is no telling whether I have read past it.
    it('does not count a mention that has no number', () => {
        expect(hasUnreadMentionIn(inbox(item({ chatNo: undefined })), C1, 0)).toBe(false);
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
        useMentionsStore.getState().markChannelRead(C1, 5);
        expect(readAtOf('C1:5')).toBeDefined();
        expect(readAtOf('C1:6')).toBeUndefined();
    });

    it('leaves other channels alone', () => {
        seed();
        useMentionsStore.getState().markChannelRead(C1, 9);
        expect(readAtOf('C2:5')).toBeUndefined();
    });

    it('stamps once — a second advance does not rewrite the mark', () => {
        seed();
        useMentionsStore.getState().markChannelRead(C1, 5);
        const first = readAtOf('C1:5');
        useMentionsStore.getState().markChannelRead(C1, 6);
        expect(readAtOf('C1:5')).toBe(first);
        expect(readAtOf('C1:6')).toBeDefined();
    });

    it('no-ops on a channel with no inbox items', () => {
        seed();
        expect(() => useMentionsStore.getState().markChannelRead({ ...C1, id: 'C9' }, 9)).not.toThrow();
        expect(Object.keys(useMentionsStore.getState().items)).toHaveLength(3);
    });

    it('does not stamp the same channel id in another place', () => {
        useMentionsStore.setState({ items: inbox(item({ id: 'C1:5', placeId: 'place-2' })) });
        useMentionsStore.getState().markChannelRead(C1, 9);
        expect(useMentionsStore.getState().items['C1:5']?.readAt).toBeUndefined();
    });

    it('does not stamp the same channel and place ids in another cloud', () => {
        useMentionsStore.setState({ items: inbox(item({ id: 'C1:5', cloudId: 'cloud-b' })) });
        useMentionsStore.getState().markChannelRead(C1, 9);
        expect(useMentionsStore.getState().items['C1:5']?.readAt).toBeUndefined();
    });
});

// The inbox also holds 1:1 messages, replies and reactions; the mention-only readers must not see them.
describe('mention-only readers', () => {
    const others = inbox(
        item({ id: 'dm', kind: 'dm' }),
        item({ id: 'reply', kind: 'reply' }),
        item({ id: 'reaction', kind: 'reaction' })
    );

    it('put no @ on a channel for a DM, a reply or a reaction', () => {
        expect(hasUnreadMentionIn(others, C1, 0)).toBe(false);
    });
});

describe('inboxItemId', () => {
    // Message ids are the cloud's own; the second cloud's message would otherwise read as captured.
    it('keys the same message id apart in two clouds', () => {
        expect(inboxItemId('cloud-a', 'm1')).not.toBe(inboxItemId('cloud-b', 'm1'));
    });
});

describe('add', () => {
    beforeEach(() => {
        useMentionsStore.setState({ items: {} });
    });

    it("keeps both clouds' items when they carry the same message id", () => {
        const { add } = useMentionsStore.getState();
        add(item({ id: inboxItemId('cloud-a', 'm1'), cloudId: 'cloud-a' }));
        add(item({ id: inboxItemId('cloud-b', 'm1'), cloudId: 'cloud-b' }));
        expect(Object.keys(useMentionsStore.getState().items)).toHaveLength(2);
    });
});

describe('keepCloudItems', () => {
    // A v0 item cannot say which cloud its place id belongs to.
    it('drops the items that name no cloud and keeps the rest', () => {
        const kept = item({ id: 'a:1' });
        const { cloudId: _dropped, ...legacy } = item({ id: 'old' });
        expect(keepCloudItems({ items: { 'a:1': kept, old: legacy } })).toEqual({ items: { 'a:1': kept } });
    });

    it('reads a missing or empty persisted state as an empty inbox', () => {
        expect(keepCloudItems(undefined)).toEqual({ items: {} });
        expect(keepCloudItems({})).toEqual({ items: {} });
    });

    // The function alone passes with the store's version or migrate unwired; this reads a stored v0 inbox.
    it('runs on a stored v0 inbox and writes it back as v1', async () => {
        const kept = item({ id: 'a:1' });
        const { cloudId: _dropped, ...legacy } = item({ id: 'old' });
        localStorage.setItem(
            'chatic-mentions',
            JSON.stringify({ state: { items: { 'a:1': kept, old: legacy } }, version: 0 })
        );

        await useMentionsStore.persist.rehydrate();

        expect(Object.keys(useMentionsStore.getState().items)).toEqual(['a:1']);
        expect(JSON.parse(localStorage.getItem('chatic-mentions') ?? '{}').version).toBe(1);
    });
});
