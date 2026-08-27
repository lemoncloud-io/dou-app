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

describe('LogUploadQueue — 바이트 상한', () => {
    /** 대략 `bytes` 크기가 되도록 data를 채운 엔트리. */
    const fat = (id: string, bytes: number): LogEntry => ({
        id,
        level: 'info',
        tag: 'TEST',
        message: 'fat',
        timestamp: 1,
        data: { blob: 'x'.repeat(bytes) },
    });

    it('건수가 남아도 바이트를 넘으면 버린다 — 큰 data 몇 개가 예산을 삼키는 것을 막는다', () => {
        // 건수 상한만 있으면 이 큐는 3건이라 전혀 걸리지 않는다. 그런데 웹에서는
        // 이 예산을 오리진 전체가 공유하므로, 로그가 다 먹으면 로그와 무관한
        // 기능이 먼저 깨진다.
        const dropped: LogEntry[][] = [];
        const queue = createLogUploadQueue({
            capacity: 100,
            maxBytes: 5_000,
            onDrop: entries => dropped.push(entries),
        });

        queue.push(fat('a', 2_000));
        queue.push(fat('b', 2_000));
        queue.push(fat('c', 2_000));

        expect(queue.size()).toBeLessThan(3);
        expect(dropped).toHaveLength(1);
    });

    it('오래된 것부터 버린다', () => {
        const queue = createLogUploadQueue({ capacity: 100, maxBytes: 5_000 });

        queue.push(fat('old', 2_000));
        queue.push(fat('new', 2_000));
        queue.push(fat('newest', 2_000));

        const held = queue.snapshot().map(entry => entry.id);
        expect(held).not.toContain('old');
        expect(held).toContain('newest');
    });

    it('상한 안에서는 아무것도 버리지 않는다', () => {
        const onDrop = jest.fn();
        const queue = createLogUploadQueue({ capacity: 100, maxBytes: 1_000_000, onDrop });

        queue.push(fat('a', 2_000));
        queue.push(fat('b', 2_000));

        expect(queue.size()).toBe(2);
        expect(onDrop).not.toHaveBeenCalled();
    });

    it('버릴 때 요약은 사건당 한 번이다 — 큐의 문제가 큐를 채우면 안 된다', () => {
        const onDrop = jest.fn();
        const queue = createLogUploadQueue({ capacity: 100, maxBytes: 5_000, onDrop });

        queue.push(fat('a', 2_000));
        queue.push(fat('b', 2_000));
        queue.push(fat('c', 2_000));

        expect(onDrop).toHaveBeenCalledTimes(1);
        expect(onDrop.mock.calls[0][0].length).toBeGreaterThan(0);
    });
});

describe('LogUploadQueue — acceptDebug', () => {
    it('기본은 debug를 안 받는다 — 릴리스에선 아무도 못 읽는다', () => {
        const queue = createLogUploadQueue();

        queue.push(entry('debug'));

        expect(queue.size()).toBe(0);
    });

    it('켜면 debug도 보관한다 — 보는 사람이 있는 빌드에서는 그게 창의 절반이다', () => {
        const queue = createLogUploadQueue({ acceptDebug: true });

        queue.push(entry('debug'));

        expect(queue.snapshot().map(e => e.level)).toEqual(['debug']);
    });

    it('상한에 닿으면 debug가 가장 먼저 버려진다 — 이 순서가 보관을 가능하게 한다', () => {
        // 이게 없으면 요청 로그 한 번의 폭주가 창의 존재 이유인 warn/error를
        // 밀어낸다. debug를 아예 안 받던 정책이 피하던 실패가 바로 그것이다.
        const queue = createLogUploadQueue({ acceptDebug: true, capacity: 3 });

        queue.push(entry('error'));
        queue.push(entry('warn'));
        queue.push(entry('debug'));
        queue.push(entry('info'));

        expect(
            queue
                .snapshot()
                .map(e => e.level)
                .sort()
        ).toEqual(['error', 'info', 'warn']);
    });

    it('restore도 같은 정책을 따른다 — 릴리스는 이전 빌드가 남긴 debug를 버린다', () => {
        const persisted = [entry('debug'), entry('info')];

        const release = createLogUploadQueue();
        release.restore(persisted);
        expect(release.snapshot().map(e => e.level)).toEqual(['info']);

        const watched = createLogUploadQueue({ acceptDebug: true });
        watched.restore(persisted);
        expect(watched.snapshot()).toHaveLength(2);
    });
});

describe('LogUploadQueue — 자기 드롭을 센다 (ADR-0071)', () => {
    const entry = (id: string): LogEntry => ({ id, level: 'info', tag: 'T', message: 'm', timestamp: 1 });

    it('아무것도 안 버렸으면 0이다', () => {
        const queue = createLogUploadQueue();

        queue.push(entry('a'));

        expect(queue.droppedCount()).toBe(0);
    });

    it('상한을 넘긴 만큼 누적한다', () => {
        const queue = createLogUploadQueue({ capacity: 3 });

        for (let i = 0; i < 10; i += 1) queue.push(entry(`e-${i}`));

        expect(queue.size()).toBe(3);
        expect(queue.droppedCount()).toBe(7);
    });

    it('읽어도 줄지 않고, 큐를 비워도 남는다 — 런 전체의 유실률이라서', () => {
        const queue = createLogUploadQueue({ capacity: 1 });

        queue.push(entry('a'));
        queue.push(entry('b'));
        expect(queue.droppedCount()).toBe(1);
        expect(queue.droppedCount()).toBe(1);

        queue.clear();

        expect(queue.droppedCount()).toBe(1);
    });
});
