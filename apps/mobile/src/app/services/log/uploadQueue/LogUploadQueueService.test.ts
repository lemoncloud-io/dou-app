import { ingestLogEntry, logger } from '@chatic/logger';

import { LogUploadQueueService } from './LogUploadQueueService';

import type { LogEntry } from '@chatic/logger';
import type { LogUploadQueuePersistence } from './types';

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
    id: over.id ?? `id-${Math.random().toString(36).slice(2, 8)}`,
    level: over.level ?? 'info',
    tag: over.tag ?? 'TEST',
    message: over.message ?? 'msg',
    timestamp: over.timestamp ?? 1,
    ...over,
});

/**
 * Feeds the store the only way it can be fed now: through the hub.
 *
 * `charge` is gone — there is no door into the store that bypasses publication,
 * which is what makes "the store is a listener" true rather than aspirational.
 */
const publish = (...entries: LogEntry[]) => entries.forEach(ingestLogEntry);

const createPersistence = (initial: LogEntry[] = [], initialLastLogAt?: number) => {
    let stored = initial;
    let lastLogAt = initialLastLogAt;
    const counter = { saves: 0 };
    return {
        get saves() {
            return counter.saves;
        },
        port: {
            load: () => stored,
            save(entries: LogEntry[]) {
                counter.saves += 1;
                stored = entries;
            },
            loadLastLogAt: () => lastLogAt,
            saveLastLogAt(timestamp: number) {
                lastLogAt = timestamp;
            },
        } as LogUploadQueuePersistence,
        get stored() {
            return stored;
        },
        get lastLogAt() {
            return lastLogAt;
        },
    };
};

describe('LogUploadQueueService — 수집', () => {
    it('debug는 전송 큐에 들어가지 않는다 — 콘솔과 Crashlytics가 그쪽 몫이다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();

        publish(entry({ level: 'debug' }), entry({ level: 'info' }));

        expect(service.getSize()).toBe(1);
        expect(service.fetch().map(item => item.level)).toEqual(['info']);
    });

    it('같은 엔트리를 두 번 발행하면 두 번 쌓인다 — 한 번만 발행되는 것이 불변식이다', () => {
        // `charge`는 배치 단위 id 디둡을 했다. 응답이 유실된 충전이 재시도될 수
        // 있었기 때문이고, 그 경로가 사라진 지금은 도착이 한 번뿐이라 막을 것이
        // 없다. 로그 한 줄마다 큐 전체를 훑어 id를 대조하는 비용을 상시로 내는
        // 대신, 서버의 id 업서트를 마지막 방어선으로 둔다.
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();
        const batch = [entry({ id: 'a' }), entry({ id: 'b' })];

        publish(...batch);
        publish(...batch);

        expect(service.getSize()).toBe(4);
        expect(new Set(service.fetch().map(item => item.id))).toEqual(new Set(['a', 'b']));
    });

    it('id 없이 넘어온 엔트리에 id를 채운다 — 없으면 ack으로 놓아줄 수 없다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();

        publish({ level: 'warn', tag: 'TEST', message: 'legacy', timestamp: 1 });

        const [stored] = service.fetch();
        expect(stored.id).toEqual(expect.any(String));
        expect(service.ack([stored.id as string])).toBe(0);
    });

    it('수집은 즉시 영속화하지 않는다 — 로그 한 줄마다 큐 전체를 다시 쓰지 않는다', () => {
        // `save`가 큐 전체를 다시 직렬화하므로, 발행마다 동기로 쓰면 `logger.*`
        // 한 줄마다 O(큐) MMKV 쓰기가 된다. 대신 디바운스하고, 창을 닫아야 하는
        // 순간(teardown·ack)에 즉시 쓴다.
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();

        publish(entry({ id: 'x' }));
        expect(p.stored).toEqual([]);

        service.teardown();
        expect(p.stored.map(item => item.id)).toEqual(['x']);
    });
});

describe('LogUploadQueueService — 2단계 배출', () => {
    it('fetch는 비파괴다 — ack만이 놓아준다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();
        publish(entry({ id: 'a' }), entry({ id: 'b' }));

        expect(service.fetch()).toHaveLength(2);
        expect(service.fetch()).toHaveLength(2);
        expect(service.getSize()).toBe(2);
    });

    it('ack은 준 id만 지우고 남은 크기를 돌려준다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();
        publish(entry({ id: 'a' }), entry({ id: 'b' }));

        expect(service.ack(['a'])).toBe(1);
        expect(service.fetch().map(item => item.id)).toEqual(['b']);
    });

    it('fetch는 limit을 지킨다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();
        publish(entry(), entry(), entry());

        expect(service.fetch(2)).toHaveLength(2);
    });

    it('빈 ack은 아무것도 바꾸지 않는다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();
        publish(entry({ id: 'a' }));

        expect(service.ack([])).toBe(1);
    });
});

describe('LogUploadQueueService — 수명', () => {
    it('init은 영속분을 복원한다 — 앱이 죽어도 미전송분이 살아남는다', () => {
        const p = createPersistence([entry({ id: 'survivor' })]);
        const service = new LogUploadQueueService(p.port);

        service.init();

        expect(service.fetch().map(item => item.id)).toEqual(['survivor']);
    });

    it('init은 멱등이다', () => {
        const p = createPersistence([entry({ id: 'a' })]);
        const service = new LogUploadQueueService(p.port);

        service.init();
        service.init();

        expect(service.getSize()).toBe(1);
    });

    it('clear는 큐를 비우고 영속분까지 지운다 — 기기 opt-out', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();
        publish(entry(), entry());

        expect(service.clear()).toBe(0);
        expect(p.stored).toEqual([]);
    });

    it('영속 레코드가 깨져 있어도 부팅을 막지 않는다', () => {
        const broken: LogUploadQueuePersistence = {
            loadLastLogAt: () => undefined,
            saveLastLogAt: () => undefined,
            load: () => {
                throw new Error('corrupt');
            },
            save: () => undefined,
        };
        const service = new LogUploadQueueService(broken);

        expect(() => service.init()).not.toThrow();
        expect(service.getSize()).toBe(0);
    });

    it('영속화 실패가 수집을 깨지 않는다', () => {
        const failing: LogUploadQueuePersistence = {
            loadLastLogAt: () => undefined,
            saveLastLogAt: () => undefined,
            load: () => [],
            save: () => {
                throw new Error('disk full');
            },
        };
        const service = new LogUploadQueueService(failing);
        service.init();

        expect(() => publish(entry())).not.toThrow();
        expect(service.getSize()).toBe(1);
    });
});

describe('LogUploadQueueService — 네이티브 dispatch 수집', () => {
    // The collection path is a hub subscription, so every service built here has
    // to be torn down or it keeps receiving entries from the next case.
    let service: LogUploadQueueService | undefined;

    afterEach(() => {
        service?.teardown();
        service = undefined;
    });

    it('앱이 직접 낸 로그가 전송 큐에 들어간다 — 이 경로가 없어 서버에 닿지 못했다', () => {
        const p = createPersistence();
        service = new LogUploadQueueService(p.port);
        service.init();

        logger.warn('APP', 'native side');

        expect(service.fetch().map(item => item.message)).toEqual(['native side']);
    });

    it('debug는 수집하지 않는다 — 큐의 레벨 정책은 경로와 무관하게 같다', () => {
        const p = createPersistence();
        service = new LogUploadQueueService(p.port);
        service.init();

        logger.debug('NET', 'GET /messages');

        expect(service.getSize()).toBe(0);
    });

    it("source:'web' 엔트리도 똑같이 적재한다 — 릴레이된 웹 로그가 네이티브와 한 저장소에 섞인다", () => {
        // 예전에는 건너뛰었다. 웹 엔트리가 두 번 도착했기 때문이고(hub 발행 + charge),
        // 필터가 어느 쪽을 셀지 골랐다. 배치 경로가 사라져 도착이 하나뿐이므로
        // `source`는 라우팅 근거가 아니라 다시 출처 라벨일 뿐이다.
        const p = createPersistence();
        service = new LogUploadQueueService(p.port);
        service.init();

        // What the bridge handler does for a relayed entry.
        ingestLogEntry({ id: 'w-1', level: 'info', tag: 'WEBVIEW', message: 'relayed', timestamp: 1, source: 'web' });

        expect(service.fetch().map(item => item.message)).toEqual(['relayed']);
    });

    it('수집 경로는 영속화를 디바운스한다 — 로그 한 줄당 동기 MMKV 쓰기를 만들지 않는다', () => {
        jest.useFakeTimers();
        try {
            const p = createPersistence();
            service = new LogUploadQueueService(p.port);
            service.init();
            const before = p.saves;

            logger.info('APP', 'one');
            logger.info('APP', 'two');
            logger.info('APP', 'three');

            expect(p.saves).toBe(before);

            jest.advanceTimersByTime(1_000);

            expect(p.saves).toBe(before + 1);
            expect(p.stored).toHaveLength(3);
        } finally {
            jest.useRealTimers();
        }
    });

    it('teardown은 밀린 쓰기를 내보내고 수집을 멈춘다', () => {
        jest.useFakeTimers();
        try {
            const p = createPersistence();
            const local = new LogUploadQueueService(p.port);
            local.init();

            logger.info('APP', 'before teardown');
            local.teardown();

            expect(p.stored.map(item => item.message)).toEqual(['before teardown']);

            logger.info('APP', 'after teardown');

            expect(local.getSize()).toBe(1);
        } finally {
            jest.useRealTimers();
        }
    });
});

/**
 * The crash-time approximation (S4). A process killed by a signal leaves no
 * timestamp, so the previous run's last log is the closest thing available —
 * and it has to survive the entries themselves being acked away.
 */
describe('LogUploadQueueService — lastLogAt', () => {
    it('부팅 시 읽은 값을 직전 실행의 시각으로 돌려준다', () => {
        const p = createPersistence([], 555);
        const service = new LogUploadQueueService(p.port);
        service.init();

        expect(service.getPreviousRunLastLogAt()).toBe(555);
    });

    it('기록이 없으면 undefined다 — 폴백 판단은 호출자 몫이다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();

        expect(service.getPreviousRunLastLogAt()).toBeUndefined();
    });

    it('이번 실행의 로그가 직전 실행 값을 밀어내지 않는다 — 밀리면 크래시 후 시각이 된다', () => {
        const p = createPersistence([], 100);
        const service = new LogUploadQueueService(p.port);
        service.init();

        publish(entry({ timestamp: 999 }));

        expect(service.getPreviousRunLastLogAt()).toBe(100);
    });

    it('수집이 마크를 전진시킨다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();

        publish(entry({ timestamp: 10 }), entry({ timestamp: 30 }));
        // 수집 경로는 영속화를 디바운스하므로, 디스크 값을 보기 전에 flush한다.
        service.teardown();

        expect(p.lastLogAt).toBe(30);
    });

    it('마크는 뒤로 가지 않는다 — 순서가 섞인 배치에도 최댓값이 남는다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();

        publish(entry({ timestamp: 50 }));
        publish(entry({ timestamp: 20 }));
        service.teardown();

        expect(p.lastLogAt).toBe(50);
    });

    it('debug도 마크를 전진시킨다 — 큐에는 안 들어가도 그 시각에 살아 있었다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();

        publish(entry({ level: 'debug', timestamp: 77 }));
        service.teardown();

        expect(service.getSize()).toBe(0);
        expect(p.lastLogAt).toBe(77);
    });

    it('ack이 큐를 비워도 마크는 남는다 — 정상 업로드 기기의 크래시가 이 경우다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();
        publish(entry({ id: 'a', timestamp: 42 }));

        service.ack(['a']);

        expect(service.getSize()).toBe(0);
        expect(p.lastLogAt).toBe(42);
    });

    it('다음 부팅이 그 값을 직전 실행 시각으로 읽는다', () => {
        const p = createPersistence();
        const first = new LogUploadQueueService(p.port);
        first.init();
        publish(entry({ id: 'a', timestamp: 42 }));
        first.ack(['a']);
        first.teardown();

        const next = new LogUploadQueueService(p.port);
        next.init();

        expect(next.getPreviousRunLastLogAt()).toBe(42);
    });
});
