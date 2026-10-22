import { toWireLogBatch, toWireLogEntry, WIRE_FIELD_CHAR_LIMIT } from './wire';
import type { LogEntry } from '../core/types';

const base: LogEntry = { id: 'e-1', level: 'info', tag: 'TEST', message: 'hello', timestamp: 1_700_000_000_000 };

describe('toWireLogEntry', () => {
    it('id·컨텍스트·기기 정보를 평탄하게 싣는다', () => {
        const wire = toWireLogEntry({
            ...base,
            runId: 'run-1',
            sid: 's-1',
            uid: 'u-1',
            cid: 'c-1',
            appVersion: '0.22.0',
            webVersion: '0.45.0',
            route: '/chat/1',
            os: 'ios',
            osVersion: '18.0',
            model: 'iPhone17,1',
            source: 'web',
        });

        expect(wire).toEqual({
            id: 'e-1',
            // Derived from the tag on the way out — the one key the wire adds to every entry.
            area: 'test',
            runId: 'run-1',
            sid: 's-1',
            uid: 'u-1',
            cid: 'c-1',
            appVersion: '0.22.0',
            webVersion: '0.45.0',
            route: '/chat/1',
            os: 'ios',
            osVersion: '18.0',
            model: 'iPhone17,1',
            source: 'web',
            level: 'info',
            tag: 'TEST',
            message: 'hello',
            timestamp: 1_700_000_000_000,
        });
    });

    it('data와 error를 문자열로 직렬화한다 — 서버 계약은 문자열이다', () => {
        const wire = toWireLogEntry({ ...base, data: { a: 1 }, error: new Error('boom') });

        expect(typeof wire.data).toBe('string');
        expect(wire.data).toContain('"a":1');
        expect(typeof wire.error).toBe('string');
        expect(wire.error).toContain('boom');
    });

    it('민감 키는 마스킹된다', () => {
        const wire = toWireLogEntry({ ...base, data: { password: 'hunter2', keep: 'ok' } });

        expect(wire.data).not.toContain('hunter2');
        expect(wire.data).toContain('keep');
    });

    it('순환 참조가 있어도 던지지 않는다', () => {
        const circular: Record<string, unknown> = { name: 'loop' };
        circular.self = circular;

        expect(() => toWireLogEntry({ ...base, data: circular })).not.toThrow();
    });

    it('긴 필드는 잘라서 페이로드가 무한히 커지지 않게 한다', () => {
        const wire = toWireLogEntry({ ...base, message: 'x'.repeat(WIRE_FIELD_CHAR_LIMIT + 500) });

        expect(wire.message?.length).toBeLessThan(WIRE_FIELD_CHAR_LIMIT + 100);
        expect(wire.message).toContain('…(+500)');
    });

    it('설정되지 않은 필드는 아예 싣지 않는다', () => {
        const wire = toWireLogEntry(base);

        expect(Object.keys(wire).sort()).toEqual(['area', 'id', 'level', 'message', 'tag', 'timestamp']);
    });

    it('계약에 없는 필드는 옮기지 않는다 — 서버가 뭐든 그대로 저장하기 때문', () => {
        const wire = toWireLogEntry({ ...base, secretInternal: 'should not travel' } as LogEntry);

        expect(wire).not.toHaveProperty('secretInternal');
    });
});

describe('toWireLogBatch', () => {
    it('봉투 없이 list 하나에 순서를 지켜 담는다', () => {
        const body = toWireLogBatch([base, { ...base, id: 'e-2', message: 'second' }]);

        expect(Object.keys(body)).toEqual(['list']);
        expect(body.list.map(e => e.id)).toEqual(['e-1', 'e-2']);
    });
});

describe('toWireLogEntry — 자격증명 마스킹', () => {
    it('identity JWT 헤더를 마스킹한다 — 서명 요청마다 실려 나가던 값이다', () => {
        const wire = toWireLogEntry({
            ...base,
            error: { config: { headers: { 'x-lemon-identity': 'eyJhbGciOi.SECRET', Accept: 'json' } } },
        });

        expect(wire.error).not.toContain('SECRET');
        expect(wire.error).toContain('[REDACTED]');
    });

    it('이미 문자열로 직렬화된 요청 본문 안쪽까지 마스킹한다', () => {
        // axios stringifies the body before the call fails, so key-based masking
        // alone would only see the opaque `data` string.
        const wire = toWireLogEntry({
            ...base,
            error: { config: { data: JSON.stringify({ password: 'hunter2', note: 'keep' }) } },
        });

        expect(wire.error).not.toContain('hunter2');
        expect(wire.error).toContain('keep');
    });

    it('OTP 코드와 이메일을 마스킹한다 — 실패한 인증 요청이 그대로 싣던 값이다', () => {
        const wire = toWireLogEntry({
            ...base,
            data: { requestBody: { alias: 'victim@example.com', code: '483920', step: 'check' } },
        });

        expect(wire.data).not.toContain('victim@example.com');
        expect(wire.data).not.toContain('483920');
        expect(wire.data).toContain('check');
    });

    it('Error 인스턴스의 내용은 그대로 남는다 — 마스킹이 진단을 지우면 안 된다', () => {
        const wire = toWireLogEntry({ ...base, error: new Error('boom') });

        expect(wire.error).toContain('boom');
    });

    /**
     * `message` doesn't go through `safeStringify` — it's already a string, so it lands in the
     * field as-is. That makes this the only masking point, and without this test, the trigger
     * that §2/§3 require ("put the server's wording in message") becomes a plaintext leak path.
     */
    it('message 안에 박힌 값도 마스킹한다', () => {
        const wire = toWireLogEntry({
            ...base,
            message: '409 CONFLICT - user someone@user.test already exists',
        });

        expect(wire.message).toBe('409 CONFLICT - user [EMAIL] already exists');
    });

    it('message의 status와 요청 타입은 그대로 남는다', () => {
        const wire = toWireLogEntry({ ...base, message: '404 NOT FOUND - relay.request(join.get)' });

        expect(wire.message).toBe('404 NOT FOUND - relay.request(join.get)');
    });

    it('data가 벌거벗은 문자열로 와도 마스킹한다', () => {
        // Without a key, name-based judgment doesn't apply — only the shape axis is left.
        const wire = toWireLogEntry({ ...base, data: 'reply-to: someone@user.test' });

        expect(wire.data).not.toContain('someone@user.test');
        expect(wire.data).toContain('[EMAIL]');
    });

    it('존재 플래그는 살려 둔다 — 값을 안 싣기 위해 만든 필드다', () => {
        const wire = toWireLogEntry({ ...base, data: { hasCode: true, hasPassword: false, errorCode: 409 } });

        expect(wire.data).toContain('"hasCode":true');
        expect(wire.data).toContain('"hasPassword":false');
        expect(wire.data).toContain('"errorCode":409');
        expect(wire.data).not.toContain('[REDACTED]');
    });
});

describe('toWireLogEntry — area, kind and structured fields', () => {
    it('derives area from the part before the first dot', () => {
        expect(toWireLogEntry({ ...base, tag: 'socket.reconnect_failed' }).area).toBe('socket');
    });

    it('lower-cases a dot-less legacy tag into its area, so old and new tags share one', () => {
        expect(toWireLogEntry({ ...base, tag: 'SOCKET' }).area).toBe('socket');
    });

    it('leaves kind off a log, whether it was omitted or written as log', () => {
        expect(toWireLogEntry(base)).not.toHaveProperty('kind');
        expect(toWireLogEntry({ ...base, kind: 'log' })).not.toHaveProperty('kind');
    });

    it('sends the structured fields of a statistic as numbers and objects, not strings', () => {
        const wire = toWireLogEntry({
            ...base,
            tag: 'perf.chat_room_open',
            kind: 'trace',
            durationMs: 381,
            attrs: { entry: 'list', cache: 'miss' },
            metrics: { mount: 327, message_count: 0 },
            sr: 0.2,
            pv: 7,
            seq: 12,
        });

        expect(wire).toMatchObject({
            area: 'perf',
            kind: 'trace',
            durationMs: 381,
            attrs: { entry: 'list', cache: 'miss' },
            metrics: { mount: 327, message_count: 0 },
            sr: 0.2,
            pv: 7,
            seq: 12,
        });
        expect(typeof wire.durationMs).toBe('number');
        expect(typeof wire.metrics?.mount).toBe('number');
    });

    it('drops the structured fields from a log entry that carries them by accident', () => {
        const wire = toWireLogEntry({
            ...base,
            durationMs: 5,
            attrs: { a: 'b' },
            metrics: { m: 1 },
            sr: 1,
            pv: 1,
            seq: 1,
        });

        for (const key of ['durationMs', 'attrs', 'metrics', 'sr', 'pv', 'seq']) expect(wire).not.toHaveProperty(key);
    });

    it('drops values of the wrong shape instead of storing them', () => {
        const wire = toWireLogEntry({
            ...base,
            kind: 'sample',
            durationMs: Number.NaN,
            attrs: { ok: 'yes', '1bad': 'x', long: 'v'.repeat(150), num: 3 as unknown as string },
            metrics: { whole: 3, frac: 1.5, inf: Number.POSITIVE_INFINITY, text: '4' as unknown as number },
            sr: 1.5,
            pv: 0.5,
            seq: -1,
        });

        expect(wire).not.toHaveProperty('durationMs');
        expect(wire.attrs).toEqual({ ok: 'yes', long: 'v'.repeat(100) });
        expect(wire.metrics).toEqual({ whole: 3, frac: 2 });
        expect(wire).not.toHaveProperty('sr');
        expect(wire).not.toHaveProperty('pv');
        expect(wire.seq).toBe(-1);
    });

    it('caps attrs at 16 and metrics at 32', () => {
        const attrs = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`a${i}`, 'v']));
        const metrics = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`m${i}`, i]));
        const wire = toWireLogEntry({ ...base, kind: 'event', attrs, metrics });

        expect(Object.keys(wire.attrs ?? {})).toHaveLength(16);
        expect(Object.keys(wire.metrics ?? {})).toHaveLength(32);
    });

    it('carries httpStatus as a number and errorCode as a string on a log', () => {
        const wire = toWireLogEntry({ ...base, level: 'error', httpStatus: 401, errorCode: 'TOKEN_EXPIRED' });

        expect(wire.httpStatus).toBe(401);
        expect(wire.errorCode).toBe('TOKEN_EXPIRED');
        expect(wire).not.toHaveProperty('kind');
    });
});
