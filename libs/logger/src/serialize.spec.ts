import type { LogEntry } from './types';

import { PER_FIELD_CHAR_LIMIT, TOTAL_CHAR_BUDGET, safeStringify, serializeLogs } from './serialize';

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
    level: 'info',
    tag: 'TAG',
    message: 'hello',
    timestamp: 1000,
    ...over,
});

describe('safeStringify — 로그 필드 안전 직렬화', () => {
    it('nullish는 undefined를 반환한다', () => {
        expect(safeStringify(undefined)).toBeUndefined();
        expect(safeStringify(null)).toBeUndefined();
    });

    it('문자열은 그대로 반환한다', () => {
        expect(safeStringify('plain')).toBe('plain');
    });

    it('순환 참조는 [Circular]로 대체하고 throw하지 않는다', () => {
        const circular: Record<string, unknown> = { a: 1 };
        circular.self = circular;
        const result = safeStringify(circular);
        expect(result).toContain('[Circular]');
    });

    it('Error는 name/message/stack로 펼친다', () => {
        const result = safeStringify(new Error('boom'));
        expect(result).toContain('boom');
        expect(result).toContain('Error');
    });
});

describe('serializeLogs — 평탄화 + 트렁케이션', () => {
    it('LogEntry를 평탄한 형태로 매핑한다', () => {
        const [out] = serializeLogs([entry({ data: { k: 'v' }, error: new Error('e') })]);
        expect(out).toMatchObject({ level: 'info', tag: 'TAG', message: 'hello', timestamp: 1000 });
        expect(out.data).toContain('"k":"v"');
        expect(out.error).toContain('e');
    });

    it('data/error가 없으면 필드를 생략한다', () => {
        const [out] = serializeLogs([entry()]);
        expect(out.data).toBeUndefined();
        expect(out.error).toBeUndefined();
    });

    it('필드 길이를 PER_FIELD_CHAR_LIMIT로 자른다', () => {
        const long = 'x'.repeat(PER_FIELD_CHAR_LIMIT + 500);
        const [out] = serializeLogs([entry({ message: long })]);
        expect(out.message.length).toBeLessThanOrEqual(PER_FIELD_CHAR_LIMIT + 20); // + truncation suffix
        expect(out.message).toContain('…');
    });

    it('총 예산을 넘기면 오래된 항목을 버리고 최신 항목을 남긴다(시간순 유지)', () => {
        // Each message is truncated to PER_FIELD_CHAR_LIMIT, so ~budget/limit entries fit.
        const maxed = 'y'.repeat(PER_FIELD_CHAR_LIMIT);
        const fitCount = Math.floor(TOTAL_CHAR_BUDGET / PER_FIELD_CHAR_LIMIT);
        const total = fitCount + 5;
        // Oldest→newest input; timestamp doubles as an identity marker.
        const entries = Array.from({ length: total }, (_, i) => entry({ message: maxed, timestamp: i }));
        const out = serializeLogs(entries);

        expect(out).toHaveLength(fitCount);
        // Newest kept, oldest dropped, and output stays chronological.
        expect(out[out.length - 1].timestamp).toBe(total - 1);
        expect(out[0].timestamp).toBe(total - fitCount);
        expect(out.map(l => l.timestamp)).toEqual([...out.map(l => l.timestamp)].sort((a, b) => a - b));
    });

    it('빈 입력은 빈 배열을 반환한다', () => {
        expect(serializeLogs([])).toEqual([]);
    });
});
