import { beforeAll, describe, expect, it } from 'vitest';

import { i18n } from '../../../i18n';
import { describeRow, eventLabelOf, eventNameOf, toneOf } from './describeRow';
import type { ReportLogRow } from './parseReportLog';

const row = (over: Partial<ReportLogRow>): ReportLogRow => ({
    id: 'x',
    type: 'log-entry',
    title: 'CHAT',
    payload: null,
    raw: null,
    parseError: false,
    ...over,
});

beforeAll(async () => {
    await i18n.loadNamespaces('user');
});

describe('describeRow', () => {
    const ko = i18n.getFixedT('ko', 'user');
    const en = i18n.getFixedT('en', 'user');

    it('names areas and statistics in the viewer language, falling back to the raw tag', () => {
        expect(eventNameOf('CHAT', 'ko')).toBe('채팅');
        expect(eventNameOf('perf.chat_room_open', 'en')).toBe('Room entry');
        expect(eventNameOf('MYSTERY', 'en')).toBeUndefined();
        expect(eventLabelOf('MYSTERY', 'en')).toBe('MYSTERY');
        // A prototype key is not a name.
        expect(eventNameOf('constructor', 'en')).toBeUndefined();
    });

    it('frames a log line with its area and keeps the message as written', () => {
        const sentence = describeRow(row({ tag: 'CHAT', level: 'error', message: 'send failed\nstack' }), ko, 'ko');
        expect(sentence).toEqual({ tone: 'error', text: '채팅 · send failed', raw: 'CHAT' });
    });

    it('reads a report, a screen view and a timed record as sentences', () => {
        expect(describeRow(row({ type: 'issue', title: 'Photos do not send' }), en, 'en').text).toBe(
            'Reported a problem: Photos do not send'
        );
        expect(
            describeRow(row({ tag: 'usage.screen_view', recordKind: 'event', attrs: { screen: '/chat' } }), ko, 'ko')
                .text
        ).toBe('/chat 화면을 열었어요');
        expect(
            describeRow(
                row({
                    tag: 'perf.chat_room_open',
                    recordKind: 'trace',
                    durationMs: 1_250,
                    attrs: { outcome: 'shown' },
                }),
                en,
                'en'
            ).text
        ).toBe('Room entry · took 1.3s · shown');
    });

    it('picks the emphasis: errors red, reports blue', () => {
        expect(toneOf(row({ level: 'error' }))).toBe('error');
        expect(toneOf(row({ type: 'issue' }))).toBe('report');
        expect(toneOf(row({ recordKind: 'trace' }))).toBe('stat');
        expect(toneOf(row({ level: 'warn' }))).toBe('warn');
    });
});
