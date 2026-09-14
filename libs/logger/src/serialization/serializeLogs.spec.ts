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

/**
 * 이 스위트가 없어서 놓쳤다. 저장된 엔트리는 부팅 때 다시 읽혀 그대로 업로더로 가므로, 여기서
 * 빠지는 것은 서버에서도 빠진다. 예전에는 level·tag·message·timestamp 넷만 남겨서
 * **프로세스보다 오래 산 엔트리 전부가** 사용자·실행·버전·화면 없이 도착했다 — 죽은 런의
 * 엔트리, 즉 가장 추적할 값이 있는 것들이다.
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

    // id는 서버의 dedup 키이면서 호스트가 ack하는 키다. 없으면 업로드는 되지만 큐에서 지워지지
    // 않아 매 주기마다 다시 올라가고, 서버는 dedup할 키가 없어 매번 새 문서로 저장한다.
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

// 리포트는 공유 Slack 채널로 가고, ADR-0047 이후 같은 항목이 sessionStorage/MMKV에
// 영속된다. serializeLogs의 소비자가 전부 그 두 경로(리포트·영속화)라, 마스킹은
// 여기서 한 번만 걸면 전 구간에 적용된다.
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
        // 민감하지 않은 값은 그대로 남아 디버깅 가치를 잃지 않는다.
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
