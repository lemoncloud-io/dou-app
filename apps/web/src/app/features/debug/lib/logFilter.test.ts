import type { AppLogInfo } from '@chatic/app-messages';

import { collectLogTags, filterLogs } from './logFilter';

const log = (partial: Partial<AppLogInfo>): AppLogInfo => ({
    level: 'info',
    tag: 'TAG',
    message: 'message',
    timestamp: 1,
    ...partial,
});

describe('filterLogs', () => {
    it('빈 필터에서는 전체를 최신순(timestamp 내림차순)으로 정렬한다', () => {
        const logs = [
            log({ message: 'a', timestamp: 1 }),
            log({ message: 'b', timestamp: 3 }),
            log({ message: 'c', timestamp: 2 }),
        ];

        const result = filterLogs(logs, { levels: new Set(), query: '' });

        expect(result.map(l => l.message)).toEqual(['b', 'c', 'a']);
    });

    it('timestamp가 같으면 나중에 삽입된 로그를 위로 올린다', () => {
        const logs = [log({ message: 'first', timestamp: 5 }), log({ message: 'second', timestamp: 5 })];

        const result = filterLogs(logs, { levels: new Set(), query: '' });

        expect(result.map(l => l.message)).toEqual(['second', 'first']);
    });

    it('levels 집합에 포함된 레벨만 남긴다', () => {
        const logs = [
            log({ message: 'd', level: 'debug', timestamp: 1 }),
            log({ message: 'e', level: 'error', timestamp: 2 }),
            log({ message: 'w', level: 'warn', timestamp: 3 }),
        ];

        const result = filterLogs(logs, { levels: new Set(['error', 'warn']), query: '' });

        expect(result.map(l => l.message)).toEqual(['w', 'e']);
    });

    it('query는 tag와 message를 대소문자 무시하고 부분 검색한다', () => {
        const logs = [
            log({ tag: 'SOCKET', message: 'connected', timestamp: 1 }),
            log({ tag: 'AUTH', message: 'token refreshed', timestamp: 2 }),
        ];

        expect(filterLogs(logs, { levels: new Set(), query: 'socket' }).map(l => l.tag)).toEqual(['SOCKET']);
        expect(filterLogs(logs, { levels: new Set(), query: 'REFRESH' }).map(l => l.tag)).toEqual(['AUTH']);
    });

    it('level 필터와 query를 함께 적용한다', () => {
        const logs = [
            log({ tag: 'A', message: 'boom', level: 'error', timestamp: 1 }),
            log({ tag: 'B', message: 'boom', level: 'info', timestamp: 2 }),
        ];

        const result = filterLogs(logs, { levels: new Set(['error']), query: 'boom' });

        expect(result.map(l => l.tag)).toEqual(['A']);
    });

    it('level이 없는 로그는 unknown으로 취급한다', () => {
        const logs = [log({ message: 'x', level: undefined, timestamp: 1 })];

        expect(filterLogs(logs, { levels: new Set(['unknown' as never]), query: '' })).toHaveLength(1);
        expect(filterLogs(logs, { levels: new Set(['info']), query: '' })).toHaveLength(0);
    });

    it('원본 배열을 변경하지 않는다', () => {
        const logs = [log({ message: 'a', timestamp: 1 }), log({ message: 'b', timestamp: 2 })];
        const snapshot = logs.map(l => l.message);

        filterLogs(logs, { levels: new Set(), query: '' });

        expect(logs.map(l => l.message)).toEqual(snapshot);
    });
});

describe('filterLogs — 질의 문법', () => {
    it('여러 낱말은 AND다 — 좁히는 게 목적이다', () => {
        const logs = [
            log({ tag: 'SOCKET', message: 'connect failed' }),
            log({ tag: 'SOCKET', message: 'connected' }),
            log({ tag: 'NET', message: 'failed' }),
        ];

        const result = filterLogs(logs, { levels: new Set(), query: 'socket failed' });

        expect(result.map(l => l.message)).toEqual(['connect failed']);
    });

    it('-접두어는 제외한다 — 시끄러운 한 줄이 나머지를 덮을 때 가장 쓸모 있다', () => {
        const logs = [log({ message: 'heartbeat' }), log({ message: 'real problem' })];

        const result = filterLogs(logs, { levels: new Set(), query: '-heartbeat' });

        expect(result.map(l => l.message)).toEqual(['real problem']);
    });

    it('tag:로 태그를 지정한다', () => {
        const logs = [log({ tag: 'NET', message: 'x' }), log({ tag: 'SOCKET', message: 'x' })];

        const result = filterLogs(logs, { levels: new Set(), query: 'tag:net' });

        expect(result.map(l => l.tag)).toEqual(['NET']);
    });

    it('따옴표는 구를 통째로 찾는다 — 로그 메시지는 문장이다', () => {
        const logs = [log({ message: 'failed to fetch profile' }), log({ message: 'fetch ok, nothing failed' })];

        const result = filterLogs(logs, { levels: new Set(), query: '"failed to fetch"' });

        expect(result.map(l => l.message)).toEqual(['failed to fetch profile']);
    });

    it('data 본문까지 찾는다 — 식별 정보는 message가 아니라 payload에 있다', () => {
        // message는 대개 일반적인 쪽("request failed")이고, 실제로 아는 단서는
        // status·id·url처럼 payload에 있다. 그걸 못 찾으면 검색이 반쪽이다.
        const logs = [
            log({ message: 'request failed', data: { status: 503, url: '/hello/profile' } }),
            log({ message: 'request failed', data: { status: 200 } }),
        ];

        const result = filterLogs(logs, { levels: new Set(), query: '503' });

        expect(result).toHaveLength(1);
        expect((result[0].data as { status: number }).status).toBe(503);
    });

    it('레벨 토글과 질의는 함께 걸린다', () => {
        const logs = [
            log({ level: 'error', message: 'boom' }),
            log({ level: 'info', message: 'boom' }),
            log({ level: 'error', message: 'quiet' }),
        ];

        const result = filterLogs(logs, { levels: new Set(['error']), query: 'boom' });

        expect(result).toHaveLength(1);
        expect(result[0].level).toBe('error');
    });

    it('태그 선택은 질의와 별개로 걸린다', () => {
        const logs = [log({ tag: 'NET', message: 'x' }), log({ tag: 'SOCKET', message: 'x' })];

        const result = filterLogs(logs, { levels: new Set(), query: '', tags: new Set(['SOCKET']) });

        expect(result.map(l => l.tag)).toEqual(['SOCKET']);
    });

    it('망가진 질의도 그냥 텍스트로 다룬다 — 검색창이 거부하거나 터지면 안 된다', () => {
        // 문법으로 안 읽히는 것은 리터럴로 떨어진다. `-` 하나는 "제외"가 아니라
        // 하이픈 검색이고, `tag:` 하나는 태그 지정이 아니라 그 문자열 검색이다.
        // 타이핑 도중의 중간 상태에서도 결과가 나오는 쪽이, 빈 화면이나 에러보다 낫다.
        const logs = [log({ message: 'a-b' }), log({ message: 'zzz' })];

        expect(filterLogs(logs, { levels: new Set(), query: '-' }).map(l => l.message)).toEqual(['a-b']);
        expect(filterLogs(logs, { levels: new Set(), query: 'tag:' }).map(l => l.message)).toEqual([]);
        expect(() => filterLogs(logs, { levels: new Set(), query: '"unclosed' })).not.toThrow();
    });
});

describe('collectLogTags', () => {
    it('실제로 존재하는 태그만 빈도순으로 준다', () => {
        const logs = [log({ tag: 'NET' }), log({ tag: 'SOCKET' }), log({ tag: 'NET' })];

        expect(collectLogTags(logs)).toEqual([
            { tag: 'NET', count: 2 },
            { tag: 'SOCKET', count: 1 },
        ]);
    });
});
