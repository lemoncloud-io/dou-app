import { logBuffer, logger } from '@chatic/logger';
import type { LogEntry } from '@chatic/logger';

import { collectBreadcrumbs, getReportLogSource, setReportLogSource, webBufferLogSource } from './logSource';

const entry = (message: string, timestamp: number): LogEntry => ({
    level: 'info',
    tag: 'TEST',
    message,
    timestamp,
});

describe('logSource', () => {
    afterEach(() => {
        setReportLogSource(webBufferLogSource);
        logBuffer.clear();
    });

    it('기본 소스는 로컬 웹 버퍼의 tail을 반환한다', async () => {
        logger.info('TEST', 'a');
        logger.info('TEST', 'b');
        logger.info('TEST', 'c');

        const entries = await getReportLogSource().tail(2);

        expect(entries.map(e => e.message)).toEqual(['b', 'c']);
    });

    it('setReportLogSource로 하이브리드 소스로 교체할 수 있다', async () => {
        setReportLogSource({ tail: async () => [entry('native', 1)] });

        const entries = await getReportLogSource().tail(10);

        expect(entries.map(e => e.message)).toEqual(['native']);
    });

    it('collectBreadcrumbs는 errorAt 이후에 끼어든 로그를 걸러낸다', async () => {
        setReportLogSource({
            tail: async () => [entry('before-1', 10), entry('before-2', 20), entry('after', 99)],
        });

        const entries = await collectBreadcrumbs(50, [], 20);

        expect(entries.map(e => e.message)).toEqual(['before-1', 'before-2']);
    });

    it('collectBreadcrumbs는 필터 후에도 최신 count개만 남긴다', async () => {
        setReportLogSource({
            tail: async () => [entry('1', 1), entry('2', 2), entry('3', 3)],
        });

        const entries = await collectBreadcrumbs(2, [], 100);

        expect(entries.map(e => e.message)).toEqual(['2', '3']);
    });

    it('소스가 실패하면 에러 시점 동기 스냅샷으로 폴백한다', async () => {
        setReportLogSource({
            tail: async () => {
                throw new Error('bridge dead');
            },
        });
        const fallback = [entry('snap-1', 1), entry('snap-2', 2)];

        const entries = await collectBreadcrumbs(1, fallback, 100);

        expect(entries.map(e => e.message)).toEqual(['snap-2']);
    });

    it('소스가 타임아웃하면 폴백한다', async () => {
        jest.useFakeTimers();
        setReportLogSource({
            tail: () => new Promise(() => undefined), // never resolves
        });
        const fallback = [entry('snap', 1)];

        const pending = collectBreadcrumbs(5, fallback);
        jest.advanceTimersByTime(1_500);
        const entries = await pending;

        expect(entries.map(e => e.message)).toEqual(['snap']);
        jest.useRealTimers();
    });
});
