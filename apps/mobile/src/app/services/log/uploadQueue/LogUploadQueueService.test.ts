import { LogUploadQueueService } from './LogUploadQueueService';

import type { LogEntry, LogPersistence } from '@chatic/logger';

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
    id: over.id ?? `id-${Math.random().toString(36).slice(2, 8)}`,
    level: over.level ?? 'info',
    tag: over.tag ?? 'TEST',
    message: over.message ?? 'msg',
    timestamp: over.timestamp ?? 1,
    ...over,
});

const createPersistence = (initial: LogEntry[] = []) => {
    let stored = initial;
    return {
        saves: 0,
        port: {
            load: () => stored,
            save(entries: LogEntry[]) {
                stored = entries;
            },
        } as LogPersistence,
        get stored() {
            return stored;
        },
    };
};

describe('LogUploadQueueService — 충전', () => {
    it('debug는 전송 큐에 들어가지 않는다 — 링버퍼가 그쪽 몫이다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();

        const result = service.charge([entry({ level: 'debug' }), entry({ level: 'info' })]);

        expect(result.accepted).toBe(1);
        expect(result.size).toBe(1);
        expect(service.fetch().map(item => item.level)).toEqual(['info']);
    });

    it('같은 배치를 다시 충전해도 중복되지 않는다 — 응답 유실 후 재시도 방어', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();
        const batch = [entry({ id: 'a' }), entry({ id: 'b' })];

        service.charge(batch);
        const second = service.charge(batch);

        expect(second.accepted).toBe(0);
        expect(second.size).toBe(2);
    });

    it('id 없이 넘어온 엔트리에 id를 채운다 — 없으면 ack으로 놓아줄 수 없다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();

        service.charge([{ level: 'warn', tag: 'TEST', message: 'legacy', timestamp: 1 }]);

        const [stored] = service.fetch();
        expect(stored.id).toEqual(expect.any(String));
        expect(service.ack([stored.id as string])).toBe(0);
    });

    it('충전은 즉시 영속화한다 — 디바운스 구간의 유실이 곧 서버 미도달이다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();

        service.charge([entry({ id: 'x' })]);

        expect(p.stored.map(item => item.id)).toEqual(['x']);
    });
});

describe('LogUploadQueueService — 2단계 배출', () => {
    it('fetch는 비파괴다 — ack만이 놓아준다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();
        service.charge([entry({ id: 'a' }), entry({ id: 'b' })]);

        expect(service.fetch()).toHaveLength(2);
        expect(service.fetch()).toHaveLength(2);
        expect(service.getSize()).toBe(2);
    });

    it('ack은 준 id만 지우고 남은 크기를 돌려준다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();
        service.charge([entry({ id: 'a' }), entry({ id: 'b' })]);

        expect(service.ack(['a'])).toBe(1);
        expect(service.fetch().map(item => item.id)).toEqual(['b']);
    });

    it('fetch는 limit을 지킨다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();
        service.charge([entry(), entry(), entry()]);

        expect(service.fetch(2)).toHaveLength(2);
    });

    it('빈 ack은 아무것도 바꾸지 않는다', () => {
        const p = createPersistence();
        const service = new LogUploadQueueService(p.port);
        service.init();
        service.charge([entry({ id: 'a' })]);

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
        service.charge([entry(), entry()]);

        expect(service.clear()).toBe(0);
        expect(p.stored).toEqual([]);
    });

    it('영속 레코드가 깨져 있어도 부팅을 막지 않는다', () => {
        const broken: LogPersistence = {
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
        const failing: LogPersistence = {
            load: () => [],
            save: () => {
                throw new Error('disk full');
            },
        };
        const service = new LogUploadQueueService(failing);
        service.init();

        expect(() => service.charge([entry()])).not.toThrow();
        expect(service.getSize()).toBe(1);
    });
});
