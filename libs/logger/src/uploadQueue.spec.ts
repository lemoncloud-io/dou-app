import { createLogUploadQueue } from './uploadQueue';
import type { LogEntry, LogLevel } from './types';

let seq = 0;
const entry = (level: LogLevel, message = ''): LogEntry => {
    seq += 1;
    return { id: `id-${seq}`, level, tag: 'TEST', message: message || `${level}-${seq}`, timestamp: seq };
};

beforeEach(() => {
    seq = 0;
});

describe('createLogUploadQueue — 배치 구성', () => {
    it('error가 없는 배치에서는 debug를 빼고 info·warn만 싣는다', () => {
        const queue = createLogUploadQueue();
        queue.pushAll([entry('debug'), entry('info'), entry('warn'), entry('debug')]);

        expect(queue.nextBatch(10).map(e => e.level)).toEqual(['info', 'warn']);
    });

    it('error가 있는 배치에서는 debug까지 함께 싣는다 — 맥락이 그때 필요하다', () => {
        const queue = createLogUploadQueue();
        queue.pushAll([entry('debug'), entry('info'), entry('error')]);

        expect(queue.nextBatch(10).map(e => e.level)).toEqual(['debug', 'info', 'error']);
    });

    it('배치에서 빠진 debug는 큐에 남는다 — 사라지면 조용한 유실이다', () => {
        const queue = createLogUploadQueue();
        queue.pushAll([entry('debug'), entry('info')]);

        const batch = queue.nextBatch(10);
        queue.remove(batch);

        expect(queue.size()).toBe(1);
        expect(queue.snapshot()[0].level).toBe('debug');
    });

    it('남아 있던 debug가 나중에 error를 만나면 함께 나간다', () => {
        const queue = createLogUploadQueue();
        queue.push(entry('debug'));
        queue.remove(queue.nextBatch(10)); // info/warn 없이 첫 배치는 비어 있다

        queue.push(entry('error'));

        expect(queue.nextBatch(10).map(e => e.level)).toEqual(['debug', 'error']);
    });

    it('error 판정은 큐 전체로 한다 — 한도 밖에 error가 있으면 debug도 맥락으로 함께 실린다', () => {
        const queue = createLogUploadQueue();
        queue.pushAll([entry('debug'), entry('info'), entry('error')]);

        expect(queue.nextBatch(2).map(e => e.level)).toEqual(['debug', 'info']);
    });

    it('앞머리가 debug로만 차 있어도 배치가 비지 않는다 — 비면 파이프라인이 멈춘다', () => {
        // debug is the highest-volume level. Judging over a positional window
        // would return [] here forever, so nothing would ship again — including
        // the error this pipeline exists to deliver.
        const queue = createLogUploadQueue();
        queue.pushAll([entry('debug'), entry('debug'), entry('debug'), entry('error')]);

        expect(queue.sendableSize()).toBe(4);
        expect(queue.nextBatch(3)).toHaveLength(3);
    });

    it('error가 전혀 없으면 debug만 있는 큐는 보낼 것이 없다', () => {
        const queue = createLogUploadQueue();
        queue.pushAll([entry('debug'), entry('debug')]);

        expect(queue.sendableSize()).toBe(0);
        expect(queue.nextBatch(10)).toEqual([]);
    });

    it('nextBatch는 아무것도 제거하지 않는다 — 2xx 전에는 큐가 유일한 사본이다', () => {
        const queue = createLogUploadQueue();
        queue.pushAll([entry('info'), entry('warn')]);

        queue.nextBatch(10);

        expect(queue.size()).toBe(2);
    });
});

describe('createLogUploadQueue — sendableSize (flush 트리거의 기준)', () => {
    it('업로드되지 않는 debug는 세지 않는다 — 큐 전체로 재면 요청이 증폭된다', () => {
        const queue = createLogUploadQueue();
        queue.pushAll([entry('debug'), entry('debug'), entry('debug'), entry('info')]);

        expect(queue.size()).toBe(4);
        expect(queue.sendableSize()).toBe(1);
    });

    it('error가 끼면 debug도 보낼 것이 되므로 함께 센다', () => {
        const queue = createLogUploadQueue();
        queue.pushAll([entry('debug'), entry('debug'), entry('error')]);

        expect(queue.sendableSize()).toBe(3);
    });
});

describe('createLogUploadQueue — 백프레셔', () => {
    it('상한을 넘으면 debug부터 버린다', () => {
        const queue = createLogUploadQueue({ capacity: 3 });
        queue.pushAll([entry('debug'), entry('info'), entry('warn'), entry('error')]);

        expect(queue.snapshot().map(e => e.level)).toEqual(['info', 'warn', 'error']);
    });

    it('debug를 다 버려도 모자라면 같은 레벨 안에서 오래된 것부터 버린다', () => {
        const queue = createLogUploadQueue({ capacity: 2 });
        queue.pushAll([entry('info', 'oldest'), entry('info', 'middle'), entry('warn', 'newest')]);

        expect(queue.snapshot().map(e => e.message)).toEqual(['middle', 'newest']);
    });

    it('드랍은 이벤트당 한 번만 알린다 — 큐 자신의 실패가 로그 폭주가 되면 안 된다', () => {
        const onDrop = jest.fn();
        const queue = createLogUploadQueue({ capacity: 2, onDrop });

        queue.pushAll([entry('debug'), entry('debug'), entry('info'), entry('warn')]);

        expect(onDrop).toHaveBeenCalledTimes(1);
        expect(onDrop.mock.calls[0][0]).toHaveLength(2);
    });

    it('상한 안에서는 아무것도 버리지 않는다', () => {
        const onDrop = jest.fn();
        const queue = createLogUploadQueue({ capacity: 5, onDrop });

        queue.pushAll([entry('info'), entry('warn')]);

        expect(onDrop).not.toHaveBeenCalled();
        expect(queue.size()).toBe(2);
    });
});

describe('createLogUploadQueue — remove와 복원', () => {
    it('전송된 항목만 id로 제거하고 나머지는 남긴다', () => {
        const queue = createLogUploadQueue();
        const sent = entry('info');
        queue.pushAll([sent, entry('warn')]);

        queue.remove([sent]);

        expect(queue.snapshot().map(e => e.level)).toEqual(['warn']);
    });

    it('id 없는 항목도 제거된다 — 구버전 앱이 넘긴 엔트리가 큐에 갇히지 않게', () => {
        const queue = createLogUploadQueue();
        const legacy: LogEntry = { level: 'info', tag: 'NATIVE', message: 'legacy', timestamp: 1 };
        queue.pushAll([legacy, entry('warn')]);

        queue.remove([legacy]);

        expect(queue.snapshot().map(e => e.message)).toEqual([expect.stringContaining('warn')]);
    });

    it('restore는 내용을 갈아끼우고 상한을 다시 적용한다 — 고아 큐 입양 경로', () => {
        const queue = createLogUploadQueue({ capacity: 2 });
        queue.push(entry('info'));

        queue.restore([entry('debug'), entry('info'), entry('warn')]);

        expect(queue.snapshot().map(e => e.level)).toEqual(['info', 'warn']);
    });
});

describe('createLogUploadQueue — pushAll 중복 제거', () => {
    it('이미 큐에 있는 id는 다시 넣지 않는다 — 하이브리드에서 웹 로그가 두 슬롯을 먹는다', () => {
        const queue = createLogUploadQueue();
        const shared = entry('info');
        queue.push(shared);

        queue.pushAll([shared, entry('warn')]);

        expect(queue.size()).toBe(2);
    });

    it('id 없는 항목은 걸러내지 않는다 — 구버전 앱 로그를 잃지 않게', () => {
        const queue = createLogUploadQueue();
        const legacy: LogEntry = { level: 'info', tag: 'N', message: 'a', timestamp: 1 };

        queue.pushAll([legacy, { ...legacy, message: 'b' }]);

        expect(queue.size()).toBe(2);
    });
});
