import type { AppLogInfo } from '@chatic/app-messages';

import { filterLogs } from './logFilter';

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
