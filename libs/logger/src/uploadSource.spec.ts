import { createLogUploadQueue } from './uploadQueue';
import { createQueueUploadSource } from './uploadSource';

import type { LogEntry, LogLevel } from './types';

let seq = 0;
const entry = (level: LogLevel = 'info'): LogEntry => {
    seq += 1;
    return { id: `id-${seq}`, level, tag: 'TEST', message: `${level}-${seq}`, timestamp: seq };
};

beforeEach(() => {
    seq = 0;
});

describe('createQueueUploadSource — 2단계 배출 계약', () => {
    it('fetch는 비파괴다 — 같은 배치를 다시 준다', async () => {
        // 이것이 계약의 핵심이다. 파괴적으로 읽으면 전송이 성공하기 전에 유일한
        // 사본이 사라져, 그 사이 프로세스가 죽으면 엔트리가 어디에도 남지 않는다.
        const queue = createLogUploadQueue();
        const source = createQueueUploadSource(queue);
        queue.push(entry());
        queue.push(entry());

        const first = await source.fetch(10);
        const second = await source.fetch(10);

        expect(first).toHaveLength(2);
        expect(second).toEqual(first);
        expect(queue.size()).toBe(2);
    });

    it('ack만이 엔트리를 놓아준다 — 준 것만 지운다', async () => {
        const queue = createLogUploadQueue();
        const source = createQueueUploadSource(queue);
        const a = entry();
        const b = entry();
        queue.push(a);
        queue.push(b);

        await source.ack([a]);

        expect(queue.snapshot()).toEqual([b]);
    });

    it('id 없는 엔트리도 ack으로 놓아준다 — 못 지우면 영원히 재전송된다', async () => {
        // 포트가 ids만 받으면 이 엔트리는 놓아줄 방법이 없어 무한 재fetch가 된다.
        const queue = createLogUploadQueue();
        const source = createQueueUploadSource(queue);
        const legacy: LogEntry = { level: 'warn', tag: 'TEST', message: 'no id', timestamp: 1 };
        queue.push(legacy);

        await source.ack([legacy]);

        expect(queue.size()).toBe(0);
    });

    it('fetch는 limit을 넘지 않는다', async () => {
        const queue = createLogUploadQueue();
        const source = createQueueUploadSource(queue);
        queue.push(entry());
        queue.push(entry());
        queue.push(entry());

        expect(await source.fetch(2)).toHaveLength(2);
    });

    it('pendingSize는 보낼 수 있는 개수를 센다 — debug는 큐에 없으므로 0이다', () => {
        const queue = createLogUploadQueue();
        const source = createQueueUploadSource(queue);

        queue.push(entry('debug'));
        expect(source.pendingSize?.()).toBe(0);

        queue.push(entry('info'));
        expect(source.pendingSize?.()).toBe(1);
    });
});
