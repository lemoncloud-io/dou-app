import type { DomainChat } from '@chatic/data';

import type { DebugRoomObservation } from '../overlay/sharedObservationStore';
import { ROOM_INSPECTOR_LIMIT, findInspectorRow, listInspectorRows, summarizeChat, toRawJson } from './roomInspector';

const chat = (partial: Partial<DomainChat>): DomainChat =>
    ({ id: 'c', chatNo: 1, content: '', ...partial }) as DomainChat;

const observation = (partial: Partial<DebugRoomObservation> = {}): DebugRoomObservation => ({
    surface: 'room',
    channelId: 'ch-1',
    channel: null,
    rendered: [],
    rows: [],
    ...partial,
});

describe('listInspectorRows', () => {
    const rendered = [chat({ id: 'a', chatNo: 1, content: 'hello' }), chat({ id: 'b', chatNo: 2, content: 'World' })];
    const rows = [...rendered, chat({ id: 'r', chatNo: 3, content: '', stereo: 'system' })];

    it('lists the chosen list newest first', () => {
        expect(listInspectorRows(observation({ rendered, rows }), 'rendered', '').rows.map(c => c.id)).toEqual([
            'b',
            'a',
        ]);
        expect(listInspectorRows(observation({ rendered, rows }), 'rows', '').rows.map(c => c.id)).toEqual([
            'r',
            'b',
            'a',
        ]);
    });

    it('matches content case-insensitively, the exact chat number, or part of the id', () => {
        const obs = observation({ rendered, rows });
        expect(listInspectorRows(obs, 'rows', 'world').rows.map(c => c.id)).toEqual(['b']);
        expect(listInspectorRows(obs, 'rows', '3').rows.map(c => c.id)).toEqual(['r']);
        expect(listInspectorRows(obs, 'rows', 'A').rows.map(c => c.id)).toEqual(['a']);
    });

    it('orders by chat number whatever order the list arrived in, unsent rows first', () => {
        const unsent = chat({ id: 'u', chatNo: 0 });
        const newestFirst = [chat({ id: 'b', chatNo: 2 }), unsent, chat({ id: 'a', chatNo: 1 })];
        expect(listInspectorRows(observation({ rows: newestFirst }), 'rows', '').rows.map(c => c.id)).toEqual([
            'u',
            'b',
            'a',
        ]);
    });

    it('caps what it returns but reports the full match count', () => {
        const many = Array.from({ length: ROOM_INSPECTOR_LIMIT + 5 }, (_, i) => chat({ id: `m${i}`, chatNo: i + 1 }));
        const result = listInspectorRows(observation({ rows: many }), 'rows', '');
        expect(result.rows).toHaveLength(ROOM_INSPECTOR_LIMIT);
        expect(result.total).toBe(ROOM_INSPECTOR_LIMIT + 5);
        expect(result.rows[0].id).toBe(`m${ROOM_INSPECTOR_LIMIT + 4}`);
    });
});

describe('findInspectorRow', () => {
    it('finds a row the room filtered out of what it shows', () => {
        const hidden = chat({ id: 'gone', hidden: true });
        expect(findInspectorRow(observation({ rows: [hidden] }), 'gone')).toBe(hidden);
    });

    it('returns null for an id in neither list', () => {
        expect(findInspectorRow(observation(), 'nope')).toBeNull();
    });
});

describe('summarizeChat', () => {
    it('labels a row by chat number and a single-line preview', () => {
        expect(summarizeChat(chat({ chatNo: 7, content: 'line one\nline two' }))).toEqual({
            label: '#7 line one line two',
            flags: [],
            stereo: null,
        });
    });

    it('cuts a long preview', () => {
        const { label } = summarizeChat(chat({ chatNo: 1, content: 'x'.repeat(60) }));
        expect(label).toBe(`#1 ${'x'.repeat(40)}…`);
    });

    it('flags unsent and hidden rows, and passes a non-user stereo through as data', () => {
        const summary = summarizeChat(chat({ chatNo: 0, hidden: true, stereo: 'system' }));
        expect(summary.flags).toEqual(['unsent', 'hidden']);
        expect(summary.stereo).toBe('system');
        expect(summarizeChat(chat({ stereo: 'user' }))).toMatchObject({ flags: [], stereo: null });
    });
});

describe('toRawJson', () => {
    it('pretty-prints a record and spells out Map fields', () => {
        expect(toRawJson({ a: 1, m: new Map([['k', 2]]) })).toBe('{\n  "a": 1,\n  "m": {\n    "k": 2\n  }\n}');
    });

    it('says when a value cannot be serialized instead of throwing', () => {
        const loop: Record<string, unknown> = {};
        loop.self = loop;
        expect(toRawJson(loop)).toMatch(/^\[unserializable: /);
    });

    it('prints undefined as a word rather than nothing', () => {
        expect(toRawJson(undefined)).toBe('undefined');
    });
});
