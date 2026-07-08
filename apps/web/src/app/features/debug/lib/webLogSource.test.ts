import { logBuffer, logger } from '@chatic/bridges';

import { webLogSource } from './webLogSource';

describe('webLogSource', () => {
    beforeEach(() => {
        logBuffer.clear();
    });

    it('fetch는 오래된 순으로 조회하고 버퍼를 유지한다', () => {
        logger.info('TAG', 'one');
        logger.info('TAG', 'two');
        logger.info('TAG', 'three');

        const { logs, size } = webLogSource.fetch(2);

        expect(logs.map(log => log.message)).toEqual(['one', 'two']);
        expect(size).toBe(3);
        expect(webLogSource.fetchSize().size).toBe(3);
    });

    it('poll은 꺼낸 항목을 버퍼에서 제거하고 남은 크기를 반환한다', () => {
        logger.info('TAG', 'one');
        logger.info('TAG', 'two');

        const { logs, size } = webLogSource.poll(1);

        expect(logs.map(log => log.message)).toEqual(['one']);
        expect(size).toBe(1);
    });

    it('clear는 버퍼 전체를 비우고 success를 반환한다', () => {
        logger.info('TAG', 'one');

        expect(webLogSource.clear()).toEqual({ success: true, size: 0 });
        expect(webLogSource.fetch().logs).toEqual([]);
    });

    it('빈 버퍼에서도 안전한 빈 응답을 반환한다', () => {
        expect(webLogSource.fetch()).toEqual({ logs: [], size: 0 });
        expect(webLogSource.poll()).toEqual({ logs: [], size: 0 });
        expect(webLogSource.fetchSize()).toEqual({ size: 0 });
    });

    it('로그 엔트리는 AppLogInfo 형태(level·tag·timestamp 포함)로 노출된다', () => {
        logger.warn('TAG', 'shaped', { id: 1 });

        const [log] = webLogSource.fetch().logs;

        expect(log).toMatchObject({
            level: 'warn',
            tag: 'TAG',
            message: 'shaped',
            data: { id: 1 },
            timestamp: expect.any(Number),
        });
    });
});
