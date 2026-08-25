import { createLogUploadQueue } from './LogUploadQueue';
import { createQueueLogStore } from './QueueLogStore';
import { toLogListener } from './LogStore';

import type { LogEntry, LogLevel } from '../core/types';

let seq = 0;
const entry = (level: LogLevel = 'info'): LogEntry => {
    seq += 1;
    return { id: `id-${seq}`, level, tag: 'TEST', message: `${level}-${seq}`, timestamp: seq };
};

beforeEach(() => {
    seq = 0;
});

describe('LogStoreReader — 2단계 배출 계약', () => {
    it('peek은 비파괴다 — 같은 배치를 다시 준다', async () => {
        // 계약의 핵심. 파괴적으로 읽으면 전송이 성공하기 전에 유일한 사본이
        // 사라져, 그 사이 프로세스가 죽으면 엔트리가 어디에도 남지 않는다.
        const queue = createLogUploadQueue();
        const store = createQueueLogStore(queue);
        store.push(entry());
        store.push(entry());

        const first = await store.peek(10);
        const second = await store.peek(10);

        expect(first).toHaveLength(2);
        expect(second).toEqual(first);
        expect(store.size()).toBe(2);
    });

    it('ack만이 엔트리를 놓아준다', async () => {
        const queue = createLogUploadQueue();
        const store = createQueueLogStore(queue);
        store.push(entry());
        store.push(entry());

        const batch = await store.peek(1);
        await store.ack(batch);

        expect(store.size()).toBe(1);
    });

    it('id가 없는 엔트리도 ack으로 놓아줄 수 있다', async () => {
        // ids만 받는 포트였다면 이런 엔트리는 영원히 재조회 대상이 된다.
        const queue = createLogUploadQueue();
        const store = createQueueLogStore(queue);
        const legacy: LogEntry = { level: 'info', tag: 'TEST', message: 'no-id', timestamp: 1 };
        store.push(legacy);

        await store.ack(await store.peek(10));

        expect(store.size()).toBe(0);
    });

    it('clear는 들고 있던 것을 버린다', async () => {
        const queue = createLogUploadQueue();
        const store = createQueueLogStore(queue);
        store.push(entry());

        await store.clear();

        expect(store.size()).toBe(0);
    });
});

describe('toLogListener — 저장하는 애', () => {
    it('발행된 엔트리를 그대로 writer에 넘긴다', () => {
        const queue = createLogUploadQueue();
        const store = createQueueLogStore(queue);
        const listener = toLogListener(store);

        const e = entry();
        listener(e);

        expect(queue.snapshot()).toEqual([e]);
    });

    it('debug는 저장소가 문 앞에서 버린다 — 리스너는 거르지 않는다', () => {
        // 레벨 정책은 리스너가 아니라 저장소의 것이다(원칙 13·16). 리스너를
        // 얇게 두면 정책이 한 군데에만 있다.
        const queue = createLogUploadQueue();
        const listener = toLogListener(createQueueLogStore(queue));

        listener(entry('debug'));

        expect(queue.size()).toBe(0);
    });
});
