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

        expect(Object.keys(wire).sort()).toEqual(['id', 'level', 'message', 'tag', 'timestamp']);
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
});
