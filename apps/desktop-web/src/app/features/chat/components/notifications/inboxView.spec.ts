import { describe, expect, it } from 'vitest';

import type { MentionItem } from '../../../../shared';
import { dayOf, inboxSource, inboxTabCounts, inboxView, isInTab } from './inboxView';

const NOW = new Date(2026, 9, 20, 15, 0).getTime();
const HOUR = 3_600_000;

const item = (id: string, over: Partial<MentionItem> = {}): MentionItem => ({
    id,
    channelId: 'C1',
    content: id,
    ownerName: 'Ada',
    createdAt: NOW - HOUR,
    ...over,
});

describe('inboxSource', () => {
    it('files a reply or a mention inside a thread under the thread', () => {
        expect(inboxSource(item('a', { kind: 'reply', parentId: '7' }))).toBe('thread');
        expect(inboxSource(item('b', { kind: 'direct', parentId: '7' }))).toBe('thread');
    });

    it('files a 1:1 message, and a reaction in a 1:1, under DM', () => {
        expect(inboxSource(item('a', { kind: 'dm' }))).toBe('dm');
        expect(inboxSource(item('b', { kind: 'reaction', inDm: true }))).toBe('dm');
    });

    it('files everything else, and old items with no kind, under the channel', () => {
        expect(inboxSource(item('a'))).toBe('channel');
        expect(inboxSource(item('b', { kind: 'everyone' }))).toBe('channel');
        expect(inboxSource(item('c', { kind: 'reaction' }))).toBe('channel');
    });
});

describe('isInTab', () => {
    it('lists mentions of me and of everyone under Mentions, wherever they were', () => {
        expect(isInTab(item('a', { kind: 'everyone' }), 'mention')).toBe(true);
        expect(isInTab(item('b', { kind: 'direct', parentId: '7' }), 'mention')).toBe(true);
        expect(isInTab(item('c', { kind: 'reply', parentId: '7' }), 'mention')).toBe(false);
        expect(isInTab(item('d', { kind: 'dm' }), 'mention')).toBe(false);
    });

    it('lists every item under All', () => {
        expect(isInTab(item('a', { kind: 'reaction' }), 'all')).toBe(true);
    });
});

describe('inboxTabCounts', () => {
    it('counts unread items per tab, and none that are read', () => {
        const counts = inboxTabCounts([
            item('a', { kind: 'direct' }),
            item('b', { kind: 'dm' }),
            item('c', { kind: 'reply', parentId: '7' }),
            item('d', { kind: 'direct', readAt: NOW }),
        ]);
        expect(counts).toEqual({ all: 3, channel: 1, dm: 1, thread: 1, mention: 1 });
    });
});

describe('inboxView', () => {
    const today = item('today', { createdAt: NOW - HOUR });
    const todayRead = item('todayRead', { createdAt: NOW - 2 * HOUR, readAt: NOW });
    const yesterday = item('yesterday', { createdAt: NOW - 24 * HOUR });
    const older = item('older', { createdAt: NOW - 4 * 24 * HOUR, readAt: NOW });
    const all = [older, todayRead, yesterday, today];
    const ids = (groups: ReturnType<typeof inboxView>) => groups.map(group => group.items.map(entry => entry.id));

    it('groups by day, newest day and newest item first', () => {
        const groups = inboxView(all, { tab: 'all', unreadOnly: false, sort: 'newest' });
        expect(groups.map(group => group.day)).toEqual([dayOf(NOW), dayOf(NOW - 24 * HOUR), dayOf(older.createdAt)]);
        expect(ids(groups)).toEqual([['today', 'todayRead'], ['yesterday'], ['older']]);
    });

    it('turns both the days and the items around for oldest first', () => {
        const groups = inboxView(all, { tab: 'all', unreadOnly: false, sort: 'oldest' });
        expect(ids(groups)).toEqual([['older'], ['yesterday'], ['todayRead', 'today']]);
    });

    it('puts the unread items of a day ahead of its read ones for unread first', () => {
        const earlierUnread = item('earlierUnread', { createdAt: NOW - 3 * HOUR });
        const groups = inboxView([todayRead, earlierUnread, today], { tab: 'all', unreadOnly: false, sort: 'unread' });
        expect(ids(groups)).toEqual([['today', 'earlierUnread', 'todayRead']]);
    });

    it('drops read items under the unread filter, except the one being kept', () => {
        expect(ids(inboxView(all, { tab: 'all', unreadOnly: true, sort: 'newest' }))).toEqual([
            ['today'],
            ['yesterday'],
        ]);
        expect(ids(inboxView(all, { tab: 'all', unreadOnly: true, sort: 'newest', keepId: 'todayRead' }))).toEqual([
            ['today', 'todayRead'],
            ['yesterday'],
        ]);
    });

    it('lists only the tab it is on', () => {
        const dm = item('dm', { kind: 'dm' });
        expect(ids(inboxView([today, dm], { tab: 'dm', unreadOnly: false, sort: 'newest' }))).toEqual([['dm']]);
    });

    it('is empty when nothing matches', () => {
        expect(inboxView([], { tab: 'all', unreadOnly: false, sort: 'newest' })).toEqual([]);
    });
});
