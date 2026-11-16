import type { TFunction } from 'i18next';

import type { NotificationItem } from '../../../utils/notifications';
import { formatDayHeading, notificationRowParts, notificationTarget, splitMentions } from './rowParts';

const t = ((key: string, options?: Record<string, string>) =>
    options ? `${key}:${JSON.stringify(options)}` : key) as unknown as TFunction;

const item = (over: Partial<NotificationItem>): NotificationItem => ({
    id: 'c:1',
    cloudId: 'c',
    channelId: 'ch',
    channelName: 'Trip',
    kind: 'mention',
    ownerName: 'Sis',
    content: 'hi',
    createdAt: new Date(2026, 10, 13, 15, 27).getTime(),
    read: false,
    chatNo: 42,
    ...over,
});
const NOW = new Date(2026, 10, 13, 18, 0).getTime();
const paths = { room: (id: string) => `/r/${id}`, thread: (id: string, root: string) => `/t/${id}/${root}` };

describe('notificationRowParts', () => {
    it('gives a mention the orange chip and no context', () => {
        expect(notificationRowParts(item({}), t, NOW, 'en-US')).toMatchObject({
            chip: 'mention',
            location: '#Trip',
            context: undefined,
        });
    });

    it('gives thread kinds the blue chip and their own context', () => {
        expect(notificationRowParts(item({ kind: 'replyToMine' }), t, NOW, 'en-US')).toMatchObject({
            chip: 'thread',
            context: 'notifications.inbox.context.replyToMine',
        });
        expect(notificationRowParts(item({ kind: 'participatedThread' }), t, NOW, 'en-US').chip).toBe('thread');
        expect(notificationRowParts(item({ kind: 'threadMention' }), t, NOW, 'en-US')).toMatchObject({
            chip: 'mention',
            context: 'notifications.inbox.context.threadMention',
        });
    });

    it('gives a reaction and a new 1:1 message no chip, and names a 1:1 as such', () => {
        const reaction = notificationRowParts(item({ kind: 'reaction', emoji: '❤️', inDm: true }), t, NOW, 'en-US');
        expect(reaction.chip).toBeUndefined();
        expect(reaction.location).toBe('notifications.inbox.dmLocation');
        expect(reaction.context).toContain('❤️');
        expect(notificationRowParts(item({ kind: 'dmMessage' }), t, NOW, 'en-US').chip).toBeUndefined();
    });

    it('prefixes a quote and leaves none when the item has none', () => {
        expect(notificationRowParts(item({ quote: 'old' }), t, NOW, 'en-US').quote).toContain('old');
        expect(notificationRowParts(item({}), t, NOW, 'en-US').quote).toBeUndefined();
    });

    it('prints the time for today and the date before that', () => {
        expect(notificationRowParts(item({}), t, NOW, 'en-US').time).toMatch(/3:27/);
        const older = notificationRowParts(
            item({ createdAt: new Date(2026, 10, 10, 9, 0).getTime() }),
            t,
            NOW,
            'en-US'
        );
        expect(older.time).toMatch(/November 10/);
    });
});

describe('notificationTarget', () => {
    it('opens a top-level message in its room, jumping to it', () => {
        expect(notificationTarget(item({}), paths)).toBe('/r/ch?chatNo=42');
    });

    it('opens a thread item in its thread', () => {
        expect(notificationTarget(item({ kind: 'replyToMine', parentId: 'ch:7' }), paths)).toBe('/t/ch/7?chatNo=42');
    });

    it('opens the message a reaction points at, not the reaction', () => {
        expect(notificationTarget(item({ kind: 'reaction', chatNo: 50, targetChatNo: 12 }), paths)).toBe(
            '/r/ch?chatNo=12'
        );
    });

    it('opens the room without a jump when the item has no number', () => {
        expect(notificationTarget(item({ chatNo: undefined }), paths)).toBe('/r/ch');
    });
});

describe('splitMentions', () => {
    it('sets every @name apart', () => {
        expect(splitMentions('@Ji look @Mo here')).toEqual([
            { text: '@Ji', mention: true },
            { text: ' look ', mention: false },
            { text: '@Mo', mention: true },
            { text: ' here', mention: false },
        ]);
    });
});

describe('formatDayHeading', () => {
    it('names today and yesterday, and dates the rest with the weekday', () => {
        expect(formatDayHeading('today', 0, t, 'en-US')).toBe('notifications.inbox.today');
        expect(formatDayHeading('yesterday', 0, t, 'en-US')).toBe('notifications.inbox.yesterday');
        expect(formatDayHeading('date', new Date(2026, 10, 9).getTime(), t, 'en-US')).toBe('Monday, November 9');
    });
});
