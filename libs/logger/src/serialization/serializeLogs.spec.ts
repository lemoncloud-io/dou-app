import type { LogEntry } from '../core/types';

import { safeStringify } from './safeStringify';
import { PER_FIELD_CHAR_LIMIT, TOTAL_CHAR_BUDGET, serializeLogs } from './serializeLogs';

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
        // Every wire field is optional — `compact` drops the keys that were never set — so the
        // presence of `message` is its own assertion before its length can be measured.
        expect(out.message).toBeDefined();
        expect(out.message?.length).toBeLessThanOrEqual(PER_FIELD_CHAR_LIMIT + 20); // + truncation suffix
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
        // `timestamp` is optional on the wire shape; the two assertions above already fail if one
        // went missing, so the sort comparator can work on a narrowed copy.
        const timestamps = out.map(l => l.timestamp ?? -1);
        expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    });

    it('빈 입력은 빈 배열을 반환한다', () => {
        expect(serializeLogs([])).toEqual([]);
    });
});

/**
 * This got missed for lack of a suite like this one. A stored entry is read back at boot and
 * goes straight to the uploader, so whatever drops out here drops out on the server too. It used
 * to keep only level/tag/message/timestamp, so **every entry that outlived its process** arrived
 * without a user, run, version, or screen — the entries from a dead run, exactly the ones most
 * worth tracing.
 */
describe('발생 시점 컨텍스트와 id는 저장을 건너 살아남는다', () => {
    const full = entry({
        id: 'entry-1',
        runId: 'run-1',
        uid: 'user-1',
        sid: 'site-1',
        cid: 'cloud-1',
        appVersion: '1.2.3',
        webVersion: '0.59.0',
        route: '/chat/ch-1',
        os: 'ios',
        osVersion: '18.0',
        model: 'iPhone16',
        source: 'web',
    });

    it('열 개 컨텍스트 필드를 모두 보존한다', () => {
        const [out] = serializeLogs([full]);

        expect(out).toMatchObject({
            runId: 'run-1',
            uid: 'user-1',
            sid: 'site-1',
            cid: 'cloud-1',
            appVersion: '1.2.3',
            webVersion: '0.59.0',
            route: '/chat/ch-1',
            os: 'ios',
            osVersion: '18.0',
            model: 'iPhone16',
        });
    });

    // id is both the server's dedup key and the key the host acks. Without it the upload still
    // happens but nothing removes the entry from the queue, so it goes up again every cycle, and
    // the server has no key to dedup on, so it stores a new document every time.
    it('id와 source를 보존한다', () => {
        const [out] = serializeLogs([full]);

        expect(out.id).toBe('entry-1');
        expect(out.source).toBe('web');
    });

    it('없는 필드는 키 자체를 만들지 않는다 — 저장된 레코드가 원본보다 넓어지면 안 된다', () => {
        const [out] = serializeLogs([entry()]);

        expect(Object.keys(out).sort()).toEqual(['level', 'message', 'tag', 'timestamp']);
    });
});

// Reports go to a shared Slack channel, and since ADR-0097 the same entries are persisted to
// sessionStorage/MMKV. Every consumer of serializeLogs is one of those two paths (report,
// persistence), so masking applied here once covers the whole pipeline.
describe('민감정보 마스킹', () => {
    it('secret으로 보이는 키의 값을 가린다', () => {
        const out = safeStringify({ accessToken: 'a.b.c', password: 'pw', authorization: 'Bearer x' });

        expect(out).not.toContain('a.b.c');
        expect(out).not.toContain('pw');
        expect(out).not.toContain('Bearer x');
        expect(JSON.parse(out as string)).toEqual({
            accessToken: '[REDACTED]',
            password: '[REDACTED]',
            authorization: '[REDACTED]',
        });
    });

    it('중첩 객체와 배열 원소 안쪽까지 닿는다', () => {
        const out = safeStringify({
            users: [{ name: 'kim', refreshToken: 'secret-1' }],
            meta: { deep: { token: 's2' } },
        });

        expect(out).not.toContain('secret-1');
        expect(out).not.toContain('s2');
        // Non-sensitive values are left intact so debugging value isn't lost.
        expect(out).toContain('kim');
    });

    it('민감한 키에 Error가 들어 있어도 가린다 (Error 분기보다 먼저 판단)', () => {
        const out = safeStringify({ sessionToken: new Error('leaky') });

        expect(out).not.toContain('leaky');
        expect(JSON.parse(out as string)).toEqual({ sessionToken: '[REDACTED]' });
    });

    it('맨 위 문자열은 판단할 수 없어 통과시킨다 — 키가 있어야 가린다', () => {
        expect(safeStringify('raw-token-value')).toBe('raw-token-value');
    });

    it('serializeLogs가 data/error 양쪽에 마스킹을 적용한다', () => {
        const [out] = serializeLogs([
            entry({ data: { identityToken: 'id-tok' }, error: { config: { accessKeyId: 'AKIA' } } }),
        ]);

        expect(out.data).not.toContain('id-tok');
        expect(out.error).not.toContain('AKIA');
        expect(out.data).toContain('[REDACTED]');
        expect(out.error).toContain('[REDACTED]');
    });
});
