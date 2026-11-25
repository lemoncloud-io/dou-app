import type { DomainChat, RoomMediaItem } from '@chatic/runtime-react';

import {
    groupByMonth,
    matchesRoomFileSearch,
    mergeNewestFirst,
    parseRoomFilesTab,
    selectionActionState,
    toRoomFileEntry,
    type RoomFileEntry,
} from './roomFiles';

const chat = (chatNo: number, over: Partial<DomainChat> = {}): DomainChat =>
    ({
        id: `ch-1:${chatNo}`,
        cid: 'c1',
        channelId: 'ch-1',
        chatNo,
        ownerId: 'u2',
        owner$: { name: 'Sunny' },
        createdAtMs: Date.UTC(2026, 10, 11),
        upload$$: [
            {
                id: 'up-a',
                stereo: 'audio',
                status: 'ready',
                contentType: 'audio/mp4',
                name: 'take.m4a',
                contentSize: 100,
                orgUrl: 'https://a',
            },
            {
                id: 'up-p',
                stereo: 'image',
                status: 'ready',
                contentType: 'image/png',
                orgUrl: 'https://p',
                thumbUrl: 'https://t',
            },
        ],
        ...over,
    }) as unknown as DomainChat;

const item = (kind: RoomMediaItem['kind'], chatNo: number, idx: number, ref = 'r'): RoomMediaItem => ({
    kind,
    idx,
    ref,
    chatId: `ch-1:${chatNo}`,
    chatNo,
    chat: chat(chatNo),
});

const entry = (chatNo: number, idx = 0, over: Partial<RoomFileEntry> = {}): RoomFileEntry =>
    ({
        key: `ch-1:${chatNo}:${idx}`,
        kind: 'image',
        idx,
        chatNo,
        chatId: `ch-1:${chatNo}`,
        chat: chat(chatNo),
        ref: 'r',
        senderName: 'Sunny',
        sentAt: 0,
        ...over,
    }) as RoomFileEntry;

describe('parseRoomFilesTab', () => {
    it('reads a known tab and falls back to photos·videos', () => {
        expect(parseRoomFilesTab('audio')).toBe('audio');
        expect(parseRoomFilesTab('nope')).toBe('media');
        expect(parseRoomFilesTab(null)).toBe('media');
    });
});

describe('toRoomFileEntry', () => {
    it('finds an attachment by its slot, and keys it by room, message and slot', () => {
        const audio = toRoomFileEntry(item('audio', 7, 0, 'up-a'), 'c1');
        expect(audio?.key).toBe('ch-1:7:0');
        expect(audio?.file).toMatchObject({ name: 'take.m4a', audio: true, state: 'ready' });
        expect(audio?.senderName).toBe('Sunny');

        const photo = toRoomFileEntry(item('image', 7, 1, 'up-p'), 'c1');
        expect(photo?.media).toMatchObject({ kind: 'image', state: 'ready' });
    });

    it('keeps a link with its address, and drops an attachment its row no longer has', () => {
        expect(toRoomFileEntry(item('link', 7, 2, 'https://x.io'), 'c1')?.ref).toBe('https://x.io');
        expect(toRoomFileEntry(item('file', 7, 5), 'c1')).toBeUndefined();
    });
});

describe('mergeNewestFirst', () => {
    it('interleaves kinds newest first, and by slot within a message', () => {
        const merged = mergeNewestFirst([
            { items: [entry(9), entry(5)], next: null },
            { items: [entry(9, 1), entry(7)], next: null },
        ]);
        expect(merged.map(e => e.key)).toEqual(['ch-1:9:0', 'ch-1:9:1', 'ch-1:7:0', 'ch-1:5:0']);
    });

    it('stops where a kind with more pages could still slot an item in', () => {
        const merged = mergeNewestFirst([
            { items: [entry(9), entry(3)], next: null },
            { items: [entry(8), entry(6)], next: 6 },
        ]);
        expect(merged.map(e => e.chatNo)).toEqual([9, 8, 6]);
    });

    it('shows nothing of a finished kind while another has not read its first page', () => {
        expect(
            mergeNewestFirst([
                { items: [entry(9)], next: null },
                { items: [], next: undefined },
            ])
        ).toEqual([]);
    });
});

describe('groupByMonth', () => {
    it('groups consecutive entries by month with a label in the reader’s language', () => {
        const groups = groupByMonth(
            [
                entry(3, 0, { sentAt: new Date(2026, 10, 11).getTime() }),
                entry(2, 0, { sentAt: new Date(2026, 10, 2).getTime() }),
                entry(1, 0, { sentAt: new Date(2026, 9, 30).getTime() }),
            ],
            'ko-KR'
        );
        expect(groups.map(group => [group.label, group.entries.length])).toEqual([
            ['2026년 11월', 2],
            ['2026년 10월', 1],
        ]);
    });
});

describe('matchesRoomFileSearch', () => {
    it('looks in the name and sender, or a link’s address', () => {
        const audio = toRoomFileEntry(item('audio', 7, 0, 'up-a'), 'c1')!;
        expect(matchesRoomFileSearch(audio, 'TAKE')).toBe(true);
        expect(matchesRoomFileSearch(audio, 'sunny')).toBe(true);
        expect(matchesRoomFileSearch(audio, 'zzz')).toBe(false);
        expect(matchesRoomFileSearch(audio, '  ')).toBe(true);
        expect(matchesRoomFileSearch(entry(1, 2, { kind: 'link', ref: 'https://dou.chatic.io/x' }), 'chatic')).toBe(
            true
        );
    });
});

describe('selectionActionState', () => {
    it('offers nothing at none, share for one only, and only delete past ten', () => {
        expect(selectionActionState(0)).toEqual({ save: false, share: false, delete: false, overLimit: false });
        expect(selectionActionState(1)).toEqual({ save: true, share: true, delete: true, overLimit: false });
        expect(selectionActionState(10)).toEqual({ save: true, share: false, delete: true, overLimit: false });
        expect(selectionActionState(11)).toEqual({ save: false, share: false, delete: true, overLimit: true });
    });
});
