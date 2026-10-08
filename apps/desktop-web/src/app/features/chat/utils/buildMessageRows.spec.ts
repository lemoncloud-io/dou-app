import { describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/data';

import { buildMessageRows, type MessageViewer } from './buildMessageRows';

const VIEWER: MessageViewer = { uid: 'me', name: 'Me', cloudUid: 'me-cloud' };
const DAY = new Date('2026-08-03T10:00:00Z').getTime();

const chat = (over: Partial<DomainChat>): DomainChat =>
    ({ channelId: 'C1', createdAt: DAY, ownerId: 'ada', ...over }) as DomainChat;

const kinds = (rows: ReturnType<typeof buildMessageRows>) => rows.map(row => row.kind);

describe('buildMessageRows — system rows', () => {
    it('emits a system row carrying the chat and its resolved author', () => {
        const rows = buildMessageRows(
            [chat({ id: 'C1:1', chatNo: 1, stereo: 'system', subType: 'join' })],
            VIEWER,
            new Map([['ada', 'Ada']])
        );

        expect(kinds(rows)).toEqual(['date', 'system']);
        expect(rows[1]).toMatchObject({ kind: 'system', authorName: 'Ada' });
    });

    it('breaks an author block, so messages either side of it do not merge', () => {
        const rows = buildMessageRows(
            [
                chat({ id: 'C1:1', chatNo: 1, content: 'before' }),
                chat({ id: 'C1:2', chatNo: 2, stereo: 'system', subType: 'leave' }),
                chat({ id: 'C1:3', chatNo: 3, content: 'after' }),
            ],
            VIEWER
        );

        expect(kinds(rows)).toEqual(['date', 'group', 'system', 'group']);
    });

    // Landing on "new messages" only to find a join event wastes the jump.
    it('does not anchor the unread divider — that belongs above the first real message', () => {
        const rows = buildMessageRows(
            [
                chat({ id: 'C1:5', chatNo: 5, content: 'read' }),
                chat({ id: 'C1:6', chatNo: 6, stereo: 'system', subType: 'join' }),
                chat({ id: 'C1:7', chatNo: 7, content: 'unread' }),
            ],
            VIEWER,
            undefined,
            5
        );

        expect(kinds(rows)).toEqual(['date', 'group', 'system', 'unread', 'group']);
    });

    it('falls back to an empty author name when the roster has not named them yet', () => {
        const rows = buildMessageRows([chat({ id: 'C1:1', chatNo: 1, stereo: 'system', subType: 'join' })], VIEWER);

        expect(rows[1]).toMatchObject({ kind: 'system', authorName: '' });
    });
});

describe('buildMessageRows — author avatar', () => {
    // A cached row carries no embedded thumbnail; mine fell back to an initial after a reload.
    it('uses my account photo for my own messages when the row has none', () => {
        const rows = buildMessageRows(
            [
                chat({ id: 'C1:1', chatNo: 1, ownerId: 'me-cloud', content: 'mine' }),
                chat({ id: 'C1:2', chatNo: 2, ownerId: 'ada', content: 'theirs' }),
            ],
            { ...VIEWER, photo: 'data:me' }
        );

        const groups = rows.flatMap(row => (row.kind === 'group' ? [row.group] : []));
        expect(groups[0]).toMatchObject({ isMine: true, avatar: 'data:me' });
        expect(groups[1]).toMatchObject({ isMine: false, avatar: undefined });
    });
});

describe('buildMessageRows — webhook sender', () => {
    const groupsOf = (rows: ReturnType<typeof buildMessageRows>) =>
        rows.flatMap(row => (row.kind === 'group' ? [row.group] : []));
    const webhook = (over: Partial<DomainChat>) => chat({ stereo: 'webhook', ownerId: 'hook', ...over });

    it('marks a webhook group and names it from owner$ when the server sends it', () => {
        const rows = buildMessageRows(
            [
                webhook({
                    id: 'C1:1',
                    chatNo: 1,
                    content: 'alarm',
                    owner$: { name: 'hello-alarm' } as DomainChat['owner$'],
                }),
            ],
            VIEWER
        );

        expect(groupsOf(rows)[0]).toMatchObject({ isWebhook: true, ownerName: 'hello-alarm', namePending: false });
    });

    // The unconfirmed case: the server may not embed owner$ for the system sender.
    it('falls back to "Webhook" when owner$ is absent, even while the roster is loading', () => {
        const rows = buildMessageRows(
            [webhook({ id: 'C1:1', chatNo: 1, content: 'alarm' })],
            VIEWER,
            undefined,
            0,
            true
        );

        expect(groupsOf(rows)[0]).toMatchObject({ isWebhook: true, ownerName: 'Webhook', namePending: false });
    });

    it('keeps a person without a name on the skeleton / "Unknown" path, not the webhook label', () => {
        const loading = buildMessageRows([chat({ id: 'C1:1', chatNo: 1, content: 'hi' })], VIEWER, undefined, 0, true);
        const settled = buildMessageRows([chat({ id: 'C1:1', chatNo: 1, content: 'hi' })], VIEWER);

        expect(groupsOf(loading)[0]).toMatchObject({ isWebhook: false, namePending: true });
        expect(groupsOf(settled)[0]).toMatchObject({ isWebhook: false, ownerName: 'Unknown' });
    });

    it('never merges a webhook into a person block, even with the same ownerId', () => {
        const rows = buildMessageRows(
            [
                chat({ id: 'C1:1', chatNo: 1, ownerId: 'same', content: 'person' }),
                chat({ id: 'C1:2', chatNo: 2, ownerId: 'same', stereo: 'webhook', content: 'card' }),
                chat({ id: 'C1:3', chatNo: 3, ownerId: 'same', content: 'person again' }),
            ],
            VIEWER,
            new Map([['same', 'Sam']])
        );

        expect(groupsOf(rows).map(group => group.isWebhook)).toEqual([false, true, false]);
    });

    it('splits webhook posts that carry different sender names under one system owner', () => {
        const named = (name: string) => ({ name }) as DomainChat['owner$'];
        const rows = buildMessageRows(
            [
                webhook({ id: 'C1:1', chatNo: 1, content: 'a', owner$: named('deploy-bot') }),
                webhook({ id: 'C1:2', chatNo: 2, content: 'b', owner$: named('hello-alarm') }),
            ],
            VIEWER
        );

        expect(groupsOf(rows).map(group => group.ownerName)).toEqual(['deploy-bot', 'hello-alarm']);
    });

    // The sender is not a member, but its owner id can still collide with a roster entry or a Place
    // nick. A webhook is named by what it carries, never by a person who shares its id.
    it('names a webhook from owner$ or "Webhook" even when its ownerId is on the roster or has a Place nick', () => {
        const rows = buildMessageRows(
            [
                webhook({ id: 'C1:1', chatNo: 1, ownerId: 'sam', content: 'a' }),
                webhook({ id: 'C1:2', chatNo: 2, ownerId: 'sam', content: 'b' }),
            ],
            VIEWER,
            new Map([['sam', 'Sam']]),
            0,
            false,
            { sam: { nick: 'Sammy' } }
        );

        const groups = groupsOf(rows);
        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({ isWebhook: true, ownerName: 'Webhook' });
        expect(groups[0].messages).toHaveLength(2);
    });

    // The viewer's own id on a webhook must not turn the card into "my message" (Delete, my avatar,
    // skipped by the unread divider).
    it('never treats a webhook as mine, even when its ownerId is the viewer', () => {
        const rows = buildMessageRows(
            [
                chat({ id: 'C1:1', chatNo: 1, ownerId: 'me', content: 'read' }),
                webhook({ id: 'C1:2', chatNo: 2, ownerId: 'me-cloud', content: 'card' }),
            ],
            { ...VIEWER, photo: 'data:me' },
            undefined,
            1
        );

        expect(kinds(rows)).toEqual(['date', 'group', 'unread', 'group']);
        expect(groupsOf(rows)[1]).toMatchObject({ isWebhook: true, isMine: false, avatar: undefined });
    });

    it('still merges consecutive webhook messages from one sender', () => {
        const rows = buildMessageRows(
            [webhook({ id: 'C1:1', chatNo: 1, content: 'a' }), webhook({ id: 'C1:2', chatNo: 2, content: 'b' })],
            VIEWER
        );

        expect(groupsOf(rows)).toHaveLength(1);
        expect(groupsOf(rows)[0].messages).toHaveLength(2);
    });
});
