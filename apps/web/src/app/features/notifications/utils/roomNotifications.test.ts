import type { DomainChannel, DomainChat } from '@chatic/runtime-react';

import { roomNotifications, type RoomNotificationInput } from './roomNotifications';

const ME = 'me';

let nextNo = 1;
const row = (fields: Partial<DomainChat> & Record<string, unknown> = {}): DomainChat => {
    const chatNo = (fields.chatNo as number | undefined) ?? nextNo++;
    return {
        id: `ch-1:${chatNo}`,
        channelId: 'ch-1',
        chatNo,
        createdAt: 10_000 + chatNo,
        ownerId: 'u-other',
        owner$: { id: 'u-other', name: 'Minsu' },
        content: `message ${chatNo}`,
        isPending: false,
        isFailed: false,
        ...fields,
    } as DomainChat;
};
const mine = (fields: Partial<DomainChat> & Record<string, unknown> = {}) =>
    row({ ownerId: ME, owner$: { id: ME, name: 'Me' }, ...fields });
const reaction = (target: string, emoji: string, fields: Partial<DomainChat> & Record<string, unknown> = {}) =>
    row({ stereo: 'system', subType: 'reaction', content: '', reaction$: { chatId: target, emoji }, ...fields });

const group = { id: 'ch-1', name: '#general', stereo: 'public' } as unknown as DomainChannel;
const dm = { id: 'ch-1', stereo: 'dm' } as unknown as DomainChannel;

const run = (fields: Partial<RoomNotificationInput>) =>
    roomNotifications({
        cloudId: 'c1',
        placeId: 'p1',
        channel: group,
        rows: [],
        viewerIds: [ME],
        readCursor: 0,
        mentionsOnly: false,
        since: 0,
        roots: new Map(),
        targets: new Map(),
        preview: chat => chat.content ?? '',
        ...fields,
    });

beforeEach(() => {
    nextNo = 1;
});

describe('roomNotifications — messages', () => {
    it('files a mention of the reader, read once the room cursor has passed it', () => {
        const unread = row({ chatNo: 5, mention$: { userIds: [ME] } });
        const read = row({ chatNo: 3, mention$: { all: true } });

        const { items } = run({ rows: [unread, read], readCursor: 4 });

        expect(items.map(item => [item.id, item.kind, item.read])).toEqual([
            ['c1:ch-1:5', 'mention', false],
            ['c1:ch-1:3', 'mention', true],
        ]);
        expect(items[0]).toMatchObject({
            placeId: 'p1',
            channelName: 'general',
            ownerName: 'Minsu',
            content: 'message 5',
        });
    });

    it("leaves out the reader's own rows, plain group messages and rows past the window", () => {
        const { items } = run({
            rows: [mine({ mention$: { all: true } }), row(), row({ mention$: { userIds: [ME] }, createdAt: 500 })],
            since: 1_000,
        });

        expect(items).toEqual([]);
    });

    it('files every new 1:1 message, the room named by its person', () => {
        const { items } = run({ channel: dm, rows: [row({ chatNo: 2 })] });

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ kind: 'dmMessage', inDm: true });
        expect(items[0].channelName).toBeUndefined();
    });

    it('keeps only mentions in a room down to mentions', () => {
        const { items } = run({ channel: dm, mentionsOnly: true, rows: [row(), row({ mention$: { userIds: [ME] } })] });

        expect(items.map(item => item.kind)).toEqual(['mention']);
    });

    it('leaves out deleted, unsent and system rows', () => {
        const { items } = run({
            channel: dm,
            rows: [row({ hidden: true }), row({ isPending: true }), row({ stereo: 'system' })],
        });

        expect(items).toEqual([]);
    });
});

describe('roomNotifications — threads', () => {
    it("files a reply in a thread whose root is the reader's, with the root as its quote", () => {
        const root = mine({ chatNo: 7, content: 'my question' });
        const reply = row({ chatNo: 9, parentId: '7' });

        const { items, missingRoots } = run({ rows: [root, reply], readCursor: 100 });

        expect(items).toEqual([
            expect.objectContaining({ kind: 'replyToMine', parentId: '7', quote: 'my question', read: false }),
        ]);
        expect(missingRoots).toEqual([]);
    });

    it("files a reply in a thread the reader replied in, whose root is someone else's", () => {
        const root = row({ chatNo: 7 });
        const { items } = run({ rows: [root, mine({ chatNo: 8, parentId: '7' }), row({ chatNo: 9, parentId: '7' })] });

        expect(items.map(item => item.kind)).toEqual(['participatedThread']);
    });

    it('leaves out a reply in a thread the reader has no part in', () => {
        const { items } = run({ rows: [row({ chatNo: 7 }), row({ chatNo: 9, parentId: '7' })] });

        expect(items).toEqual([]);
    });

    it('asks for a root outside the window and files the reply once it arrives', () => {
        const reply = row({ chatNo: 9, parentId: '7' });

        const before = run({ rows: [reply] });
        const after = run({ rows: [reply], roots: new Map([['7', mine({ chatNo: 7, content: 'old root' })]]) });

        expect(before).toEqual({ items: [], missingRoots: ['7'], missingTargets: [] });
        expect(after.items).toEqual([expect.objectContaining({ kind: 'replyToMine', quote: 'old root' })]);
        expect(after.missingRoots).toEqual([]);
    });

    it('files a thread reply that names the reader as a thread mention without asking for its root', () => {
        const { items, missingRoots } = run({ rows: [row({ chatNo: 9, parentId: '7', mention$: { userIds: [ME] } })] });

        expect(items.map(item => item.kind)).toEqual(['threadMention']);
        expect(missingRoots).toEqual([]);
    });

    it('reads a thread item the reader has since replied after, and not one that came later', () => {
        const root = mine({ chatNo: 7 });
        const { items } = run({
            rows: [
                root,
                row({ chatNo: 9, parentId: '7' }),
                mine({ chatNo: 10, parentId: '7' }),
                row({ chatNo: 11, parentId: '7' }),
            ],
        });

        expect(items.map(item => [item.chatNo, item.read])).toEqual([
            [9, true],
            [11, false],
        ]);
    });

    it("reads an optimistic reply's full parent id the same as a persisted one's chat number", () => {
        const root = mine({ chatNo: 7 });
        const { items } = run({ rows: [root, row({ chatNo: 9, parentId: 'ch-1:7' })] });

        expect(items).toEqual([expect.objectContaining({ kind: 'replyToMine', parentId: '7' })]);
    });
});

describe('roomNotifications — reactions', () => {
    it("files a reaction to the reader's message, keyed by target, emoji and person", () => {
        const target = mine({ chatNo: 3, content: 'my photo' });
        const { items } = run({ rows: [target, reaction('ch-1:3', '👍', { chatNo: 4 })], readCursor: 4 });

        expect(items).toEqual([
            expect.objectContaining({
                id: 'c1:reaction:ch-1:3:👍:u-other',
                kind: 'reaction',
                emoji: '👍',
                content: '👍',
                quote: 'my photo',
                targetChatNo: 3,
                read: true,
            }),
        ]);
    });

    it('lets the newest event win, so a reaction taken back leaves nothing', () => {
        const target = mine({ chatNo: 3 });
        const takenBack = run({
            rows: [
                target,
                reaction('ch-1:3', '👍', { chatNo: 4 }),
                reaction('ch-1:3', '👍', { chatNo: 5, reaction$: { chatId: 'ch-1:3', emoji: '👍', action: 'off' } }),
            ],
        });
        const givenAgain = run({
            rows: [
                target,
                reaction('ch-1:3', '👍', { chatNo: 6 }),
                reaction('ch-1:3', '👍', { chatNo: 5, reaction$: { chatId: 'ch-1:3', emoji: '👍', action: 'off' } }),
            ],
        });

        expect(takenBack.items).toEqual([]);
        expect(givenAgain.items.map(item => item.chatNo)).toEqual([6]);
    });

    it("leaves out a reaction to someone else's message, and the reader's own reactions", () => {
        const { items } = run({
            rows: [
                row({ chatNo: 3 }),
                reaction('ch-1:3', '👍', { chatNo: 4 }),
                mine({ chatNo: 5 }),
                reaction('ch-1:5', '🎉', { chatNo: 6, ownerId: ME, owner$: { id: ME } }),
            ],
        });

        expect(items).toEqual([]);
    });

    it('asks for a target outside the window and keeps it out when the cache has none', () => {
        const rows = [reaction('ch-1:1', '👍', { chatNo: 4 })];

        expect(run({ rows }).missingTargets).toEqual(['ch-1:1']);
        expect(run({ rows, targets: new Map([['ch-1:1', null]]) })).toEqual({
            items: [],
            missingRoots: [],
            missingTargets: [],
        });
    });

    it("files a reaction to a reply of the reader's under its thread, unread by the room cursor", () => {
        const target = mine({ chatNo: 8, parentId: '7' });
        const { items } = run({ rows: [target, reaction('ch-1:8', '👍', { chatNo: 9 })], readCursor: 100 });

        expect(items).toEqual([expect.objectContaining({ kind: 'reaction', parentId: '7', read: false })]);
    });

    it('keeps no reactions in a room down to mentions', () => {
        const { items } = run({
            mentionsOnly: true,
            rows: [mine({ chatNo: 3 }), reaction('ch-1:3', '👍', { chatNo: 4 })],
        });

        expect(items).toEqual([]);
    });
});
