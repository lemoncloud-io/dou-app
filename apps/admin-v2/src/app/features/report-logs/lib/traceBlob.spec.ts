import { describe, expect, it } from 'vitest';

import type { ReportLogRow } from './parseReportLog';
import { buildTraceBlob, composeStackText } from './traceBlob';

const row = (overrides: Partial<ReportLogRow> = {}): ReportLogRow => ({
    id: '42',
    type: 'error',
    app: 'mobile',
    title: '[mobile] script-error',
    payload: { timestamp: '2026-08-11T07:12:33.000Z', webVersion: '0.36.0' },
    raw: {},
    parseError: false,
    ...overrides,
});

const STACK = 'a@https://dou-dev.chatic.io/assets/index-abc.js:1:9';

describe('composeStackText', () => {
    it('payload가 없으면 빈 문자열', () => {
        expect(composeStackText(null)).toBe('');
    });

    it('cause가 없으면 stack 그대로', () => {
        expect(composeStackText({ stack: STACK })).toBe(STACK);
    });

    // 감싼 에러의 stack은 감싼 자리를 가리키므로, 읽을 값이 있는 프레임은 cause 쪽이다.
    it('cause 체인을 `Caused by:`로 이어붙여 한 덩어리로 만든다', () => {
        const text = composeStackText({
            stack: STACK,
            causes: [{ message: 'decode failed', stack: 'd@https://x/index-abc.js:2:1' }, { message: 'root cause' }],
        });

        expect(text.split('\n\n')).toEqual([
            STACK,
            'Caused by: decode failed\nd@https://x/index-abc.js:2:1',
            'Caused by: root cause',
        ]);
    });

    // stack 없는 opaque script-error라도 cause가 있으면 그것만으로 블록이 선다.
    it('stack이 없어도 cause만으로 만든다', () => {
        expect(composeStackText({ causes: [{ message: 'only cause' }] })).toBe('Caused by: only cause');
    });
});

describe('buildTraceBlob', () => {
    it('`yarn trace` 가 읽는 헤더 한 줄과 스택을 붙인다', () => {
        expect(buildTraceBlob(row(), STACK)).toBe(
            `# chatic-report id=42 app=mobile webVersion=0.36.0 at=2026-08-11T07:12:33.000Z\n${STACK}\n`
        );
    });

    it('payload 에 시각이 없으면 레코드 생성 시각으로 대신한다', () => {
        const blob = buildTraceBlob(row({ payload: {}, createdAt: Date.parse('2026-08-11T09:00:00.000Z') }), STACK);

        expect(blob).toContain('at=2026-08-11T09:00:00.000Z');
    });

    it('없는 필드는 헤더에서 아예 뺀다 — 빈 값으로 두면 파싱이 헛돈다', () => {
        const blob = buildTraceBlob(row({ app: undefined, payload: {}, createdAt: undefined }), STACK);

        expect(blob.split('\n')[0]).toBe('# chatic-report id=42');
    });

    it('파싱 불가능한 시각은 넣지 않는다', () => {
        const blob = buildTraceBlob(row({ payload: { timestamp: 'not-a-date' }, createdAt: undefined }), STACK);

        expect(blob).not.toContain('at=');
    });

    it('값 안의 공백은 접는다 — 헤더는 공백으로 필드를 나눈다', () => {
        const blob = buildTraceBlob(row({ payload: { webVersion: '0.36.0 dirty' } }), STACK);

        expect(blob.split('\n')[0]).toContain('webVersion=0.36.0_dirty');
    });
});
