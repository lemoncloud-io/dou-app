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
