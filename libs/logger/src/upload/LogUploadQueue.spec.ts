import { createLogUploadQueue } from './LogUploadQueue';
import type { LogEntry, LogLevel } from '../core/types';

let seq = 0;
const entry = (level: LogLevel, message = ''): LogEntry => {
    seq += 1;
    return { id: `id-${seq}`, level, tag: 'TEST', message: message || `${level}-${seq}`, timestamp: seq };
};

beforeEach(() => {
    seq = 0;
});

describe('createLogUploadQueue — debug는 큐에 들어가지 않는다', () => {
    it('push는 debug 엔트리를 담지 않는다', () => {
        const queue = createLogUploadQueue();
        queue.push(entry('debug'));

        expect(queue.size()).toBe(0);
    });

    it('pushAll도 debug만 걸러내고 나머지는 담는다', () => {
        const queue = createLogUploadQueue();
        queue.pushAll([entry('debug'), entry('info'), entry('warn'), entry('debug')]);

        expect(queue.nextBatch(10).map(e => e.level)).toEqual(['info', 'warn']);
    });

    it('error가 섞여 있어도 debug는 여전히 실리지 않는다', () => {
        const queue = createLogUploadQueue();
        queue.pushAll([entry('debug'), entry('info'), entry('error')]);

        expect(queue.nextBatch(10).map(e => e.level)).toEqual(['info', 'error']);
    });

    it('debug만 보낸 pushAll은 아무것도 담지 않는다', () => {
        const queue = createLogUploadQueue();
        queue.pushAll([entry('debug'), entry('debug')]);

        expect(queue.size()).toBe(0);
    });

    it('restore로 복원되는 스냅샷도 debug는 걸러진다 — 구버전 빌드가 남긴 스냅샷 대비', () => {
        const queue = createLogUploadQueue({ capacity: 10 });
        queue.restore([entry('debug'), entry('info'), entry('debug')]);

        expect(queue.snapshot().map(e => e.level)).toEqual(['info']);
    });
});

describe('createLogUploadQueue — 배치 구성', () => {
    it('nextBatch는 담긴 순서대로 최대 limit개를 돌려준다', () => {
        const queue = createLogUploadQueue();
        queue.pushAll([entry('info'), entry('warn'), entry('error')]);

        expect(queue.nextBatch(2).map(e => e.level)).toEqual(['info', 'warn']);
    });

    it('nextBatch는 아무것도 제거하지 않는다 — 2xx 전에는 큐가 유일한 사본이다', () => {
        const queue = createLogUploadQueue();
        queue.pushAll([entry('info'), entry('warn')]);

        queue.nextBatch(10);

        expect(queue.size()).toBe(2);
    });

    it('비어 있으면 nextBatch도 빈 배열이다', () => {
        const queue = createLogUploadQueue();

        expect(queue.nextBatch(10)).toEqual([]);
    });
});

describe('createLogUploadQueue — sendableSize (flush 트리거의 기준)', () => {
    it('큐에 담긴 전부가 sendable이다 — debug는 애초에 없다', () => {
        const queue = createLogUploadQueue();
        queue.pushAll([entry('debug'), entry('info'), entry('warn')]);

        expect(queue.sendableSize()).toBe(2);
    });
});

describe('createLogUploadQueue — 백프레셔', () => {
    it('상한을 넘으면 낮은 레벨부터 버린다', () => {
        const queue = createLogUploadQueue({ capacity: 2 });
        queue.pushAll([entry('info'), entry('warn'), entry('error')]);

        expect(queue.snapshot().map(e => e.level)).toEqual(['warn', 'error']);
    });

    it('같은 레벨 안에서는 오래된 것부터 버린다', () => {
        const queue = createLogUploadQueue({ capacity: 2 });
        queue.pushAll([entry('info', 'oldest'), entry('info', 'middle'), entry('warn', 'newest')]);

        expect(queue.snapshot().map(e => e.message)).toEqual(['middle', 'newest']);
    });

    it('드랍은 이벤트당 한 번만 알린다 — 큐 자신의 실패가 로그 폭주가 되면 안 된다', () => {
        const onDrop = jest.fn();
        const queue = createLogUploadQueue({ capacity: 2, onDrop });

        queue.pushAll([entry('info'), entry('info'), entry('warn'), entry('error')]);

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

        queue.restore([entry('info'), entry('warn'), entry('error')]);

        expect(queue.snapshot().map(e => e.level)).toEqual(['warn', 'error']);
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
