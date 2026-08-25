import { LOG_CONTEXT_FIELDS } from '@chatic/logger';

import { toAppLogInfo, toLogEntry } from './appLogInfoCodec';

import type { AppLogInfo } from '@chatic/app-messages';
import type { LogContext, LogEntry } from '@chatic/logger';

/**
 * Built from `LOG_CONTEXT_FIELDS`, not hand-listed. A field added to
 * `LogContext` therefore enters this fixture on its own — which is the whole
 * point, since the failure this guards against is a mapper that silently drops
 * a field nobody remembered to add to a test.
 */
const contextFixture = Object.fromEntries(LOG_CONTEXT_FIELDS.map(field => [field, `v-${field}`])) as Record<
    keyof LogContext,
    string
>;

const entryOf = (overrides: Partial<LogEntry> = {}): LogEntry => ({
    ...contextFixture,
    id: 'e-1',
    level: 'info',
    tag: 'NET',
    message: 'ok',
    timestamp: 1_700_000_000_000,
    ...overrides,
});

describe('appLogInfoCodec — 컨텍스트 튜플', () => {
    it('왕복에서 컨텍스트 필드가 한 개도 빠지지 않는다', () => {
        const entry = entryOf();

        const round = toLogEntry(toAppLogInfo(entry));

        LOG_CONTEXT_FIELDS.forEach(field => {
            expect(round[field]).toBe(entry[field]);
        });
        expect(round.id).toBe('e-1');
        expect(round.timestamp).toBe(entry.timestamp);
    });

    it('toAppLogInfo도 튜플 전체를 싣는다 — 한 방향만 맞는 상태를 막는다', () => {
        const info = toAppLogInfo(entryOf());

        LOG_CONTEXT_FIELDS.forEach(field => {
            expect(info[field]).toBe(`v-${field}`);
        });
    });

    it('설정되지 않은 컨텍스트 키는 아예 만들지 않는다', () => {
        // A restored entry must not gain a `route: undefined` it never had —
        // the payload is stored as-is by the server.
        const info = toAppLogInfo({ level: 'warn', tag: 'APP', message: 'x', timestamp: 1 });

        LOG_CONTEXT_FIELDS.forEach(field => {
            expect(info).not.toHaveProperty(field);
        });
    });
});

describe('toAppLogInfo (LogEntry → AppLogInfo)', () => {
    it('source를 web으로 고정하고 Error는 평탄화하되 data는 구조를 유지한다', () => {
        const info = toAppLogInfo(
            entryOf({
                level: 'error',
                data: { userId: 'u1', nested: { count: 2 } },
                error: new Error('boom'),
            })
        );

        expect(info.source).toBe('web');
        // Structure kept, not stringified: the native merged buffer is what a
        // debug UI renders.
        expect(info.data).toEqual({ userId: 'u1', nested: { count: 2 } });
        expect(info.error).toMatchObject({ name: 'Error', message: 'boom' });
    });

    it('axios 에러의 요청/응답 상세만 이 자리에서 마스킹된다 — 일반 data는 저장·전송 경계에 맡긴다', () => {
        // The split is deliberate. An axios error carries secrets in a shape
        // this mapper has to take apart anyway (`config` never rides along), so
        // it masks there. A plain `data` object is passed through intact and
        // masked by whichever boundary stores or sends it — `serializeLogs` for
        // MMKV/localStorage, `toWireLogEntry` for the server. The merged buffer
        // itself never leaves the device on its own.
        const axiosError = Object.assign(new Error('Request failed with status code 400'), {
            isAxiosError: true,
            config: { method: 'post', url: '/hello/login', data: { id: 'u1', password: 'secret' } },
        });

        const info = toAppLogInfo(entryOf({ level: 'error', data: { password: 'plain' }, error: axiosError }));

        expect((info.error as Record<string, any>).request.data).toEqual({ id: 'u1', password: '[REDACTED]' });
        expect(info.data).toEqual({ password: 'plain' });
    });
});

describe('toLogEntry (AppLogInfo → LogEntry)', () => {
    it('id와 발생 시점 컨텍스트를 그대로 복원한다', () => {
        // The uploader drains this buffer into its queue, which dedups on the
        // id; the context must stay the one captured when the entry was
        // written, not whatever is current at drain time.
        const info: AppLogInfo = {
            id: 'native-1',
            runId: 'run-3',
            uid: 'u-3',
            cid: 'c-3',
            sid: 's-3',
            route: '/home',
            appVersion: '0.22.0',
            os: 'android',
            model: 'Pixel 9',
            tag: 'PUSH_EVENT',
            message: 'received',
            level: 'info',
            timestamp: 555,
            source: 'native',
        };

        expect(toLogEntry(info)).toEqual(
            expect.objectContaining({
                id: 'native-1',
                runId: 'run-3',
                uid: 'u-3',
                cid: 'c-3',
                sid: 's-3',
                route: '/home',
                appVersion: '0.22.0',
                os: 'android',
                model: 'Pixel 9',
                timestamp: 555,
                source: 'native',
            })
        );
    });

    it('구버전 앱이 보낸 최소 필드도 정규화한다', () => {
        const entry = toLogEntry({ tag: 'APP' } as AppLogInfo);

        expect(entry).toEqual({ level: 'info', tag: 'APP', message: '', timestamp: 0 });
    });

    it('없는 컨텍스트 키는 아예 만들지 않는다', () => {
        expect(toLogEntry({ tag: 'APP', message: 'x', timestamp: 1 } as AppLogInfo)).not.toHaveProperty('runId');
    });
});
