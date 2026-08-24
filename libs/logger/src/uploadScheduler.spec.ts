import { createLogUploadQueue } from './uploadQueue';
import { createQueueUploadSource } from './uploadSource';
import { createLogUploadScheduler, DEFAULT_MAX_ATTEMPTS } from './uploadScheduler';
import type { UploadOutcome } from './uploadScheduler';
import type { LogEntry, LogLevel } from './types';

let seq = 0;
const entry = (level: LogLevel = 'info'): LogEntry => {
    seq += 1;
    return { id: `id-${seq}`, level, tag: 'TEST', message: `${level}-${seq}`, timestamp: seq };
};

/** Minimal deterministic clock + timer so timing rules are asserted, not awaited. */
const createHarness = () => {
    let clock = 0;
    let pending: { at: number; run: () => void; id: number } | undefined;
    let nextId = 0;

    return {
        now: () => clock,
        schedule: ((run: () => void, ms: number) => {
            nextId += 1;
            pending = { at: clock + ms, run, id: nextId };
            return nextId as unknown as ReturnType<typeof setTimeout>;
        }) as never,
        cancel: ((handle: number) => {
            if (pending?.id === (handle as unknown as number)) pending = undefined;
        }) as never,
        /** Delay the currently armed timer is waiting for. */
        dueIn: () => (pending ? pending.at - clock : undefined),
        /** Runs the armed timer and lets its promise chain settle. */
        async fire() {
            const due = pending;
            if (!due) throw new Error('no timer armed');
            clock = due.at;
            pending = undefined;
            due.run();
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        },
        advance(ms: number) {
            clock += ms;
        },
    };
};

beforeEach(() => {
    seq = 0;
});

describe('createLogUploadScheduler — flush 트리거', () => {
    it('보낼 엔트리가 배치 크기에 차면 즉시 보낸다', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('ok');
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send,
            batchSize: 2,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();

        const a = entry();
        queue.push(a);
        scheduler.notify(a);
        expect(send).not.toHaveBeenCalled();

        const b = entry();
        queue.push(b);
        scheduler.notify(b);
        await Promise.resolve();

        expect(send).toHaveBeenCalledTimes(1);
    });

    it('debug만 쌓이면 배치 크기에 닿지 않는다 — 큐 전체로 재면 요청이 증폭된다', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('ok');
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send,
            batchSize: 2,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();

        for (let i = 0; i < 5; i += 1) {
            const e = entry('debug');
            queue.push(e);
            scheduler.notify(e);
        }
        await Promise.resolve();

        expect(send).not.toHaveBeenCalled();
    });

    it('시간이 지나면 배치가 덜 찼어도 보낸다', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('ok');
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send,
            batchSize: 50,
            intervalMs: 60_000,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();
        queue.push(entry());

        expect(h.dueIn()).toBe(60_000);
        await h.fire();

        expect(send).toHaveBeenCalledTimes(1);
    });

    it('flushNow는 강제로 보낸다 (백그라운드 진입·pagehide)', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('ok');
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();
        queue.push(entry());

        await scheduler.flushNow();

        expect(send).toHaveBeenCalledTimes(1);
    });

    it('보낼 게 없으면 요청하지 않는다', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('ok');
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();

        await scheduler.flushNow();

        expect(send).not.toHaveBeenCalled();
    });
});

describe('createLogUploadScheduler — error 앞당김', () => {
    it('error가 나면 다음 배치를 앞당기되 즉시 보내지는 않는다', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('ok');
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send,
            batchSize: 50,
            intervalMs: 60_000,
            errorAdvanceMs: 5_000,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();

        const e = entry('error');
        queue.push(e);
        scheduler.notify(e);

        expect(send).not.toHaveBeenCalled();
        expect(h.dueIn()).toBe(5_000);
    });

    it('하한 안에서는 재앞당기지 않는다 — 에러 폭주가 연속 flush가 되면 안 된다', () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send: jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('ok'),
            batchSize: 50,
            errorAdvanceMs: 5_000,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();

        const first = entry('error');
        queue.push(first);
        scheduler.notify(first);

        h.advance(1_000);
        const second = entry('error');
        queue.push(second);
        scheduler.notify(second);

        // Still the original advance, not re-armed to a fresh 5s.
        expect(h.dueIn()).toBe(4_000);
    });

    it('백오프 재시도 중에는 앞당김을 무시한다', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('retry');
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send,
            batchSize: 50,
            backoffMs: [5_000, 30_000],
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();
        queue.push(entry());

        await scheduler.flushNow();
        expect(h.dueIn()).toBe(5_000);

        const e = entry('error');
        queue.push(e);
        scheduler.notify(e);

        expect(h.dueIn()).toBe(5_000);
    });
});

describe('createLogUploadScheduler — 응답 처리', () => {
    it('2xx면 배치를 큐에서 제거한다', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send: jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('ok'),
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();
        queue.push(entry());

        await scheduler.flushNow();

        expect(queue.size()).toBe(0);
    });

    it('4xx면 재시도 없이 폐기한다', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('discard');
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send,
            intervalMs: 60_000,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();
        queue.push(entry());

        await scheduler.flushNow();

        expect(queue.size()).toBe(0);
        expect(h.dueIn()).toBe(60_000);
    });

    it('5xx면 백오프가 커지며 같은 id로 재전송한다', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('retry');
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send,
            backoffMs: [5_000, 30_000, 120_000],
            maxAttempts: 5,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();
        const only = entry();
        queue.push(only);

        await scheduler.flushNow();
        expect(h.dueIn()).toBe(5_000);

        await h.fire();
        expect(h.dueIn()).toBe(30_000);

        await h.fire();
        expect(h.dueIn()).toBe(120_000);

        expect(send.mock.calls.every(call => call[0][0].id === only.id)).toBe(true);
        expect(queue.size()).toBe(1);
    });

    it('전송 함수가 던져도 5xx와 같게 재시도로 다룬다', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockRejectedValue(new Error('offline'));
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send,
            backoffMs: [5_000],
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();
        queue.push(entry());

        await scheduler.flushNow();

        expect(h.dueIn()).toBe(5_000);
        expect(queue.size()).toBe(1);
    });
});

describe('createLogUploadScheduler — 시도 상한 (무한 재전송 차단)', () => {
    it('상한을 소진하면 배치를 폐기하고 재전송을 멈춘다', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('retry');
        const onGiveUp = jest.fn();
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send,
            backoffMs: [1_000],
            maxAttempts: 3,
            intervalMs: 60_000,
            onGiveUp,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();
        queue.push(entry());

        await scheduler.flushNow(); // attempt 1
        await h.fire(); // attempt 2
        await h.fire(); // attempt 3 → 상한 소진

        expect(send).toHaveBeenCalledTimes(3);
        expect(queue.size()).toBe(0);
        expect(onGiveUp).toHaveBeenCalledTimes(1);
        expect(h.dueIn()).toBe(60_000);
    });

    it('상한 소진 후에는 같은 배치를 다시 보내지 않는다', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('retry');
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send,
            backoffMs: [1_000],
            maxAttempts: 2,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();
        queue.push(entry());

        await scheduler.flushNow();
        await h.fire();
        const callsAtGiveUp = send.mock.calls.length;

        await h.fire();

        expect(send).toHaveBeenCalledTimes(callsAtGiveUp);
    });

    it('기본 상한이 유한하다 — 상태 코드와 무관하게 종료를 보장하는 값이다', () => {
        expect(Number.isFinite(DEFAULT_MAX_ATTEMPTS)).toBe(true);
        expect(DEFAULT_MAX_ATTEMPTS).toBeGreaterThan(0);
    });
});

describe('createLogUploadScheduler — 원격 스위치와 수명', () => {
    it('꺼져 있으면 큐만 쌓이고 요청이 나가지 않는다', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('ok');
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send,
            isEnabled: () => false,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();
        queue.push(entry());

        await scheduler.flushNow();

        expect(send).not.toHaveBeenCalled();
        expect(queue.size()).toBe(1);
    });

    it('stop 이후에는 타이머가 돌지 않는다', () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send: jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('ok'),
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();
        scheduler.stop();

        expect(h.dueIn()).toBeUndefined();
    });
});

describe('createLogUploadScheduler — onSettled (영속화 훅)', () => {
    const build = (outcome: UploadOutcome, onSettled: () => void, h: ReturnType<typeof createHarness>) => {
        const queue = createLogUploadQueue();
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send: jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue(outcome),
            backoffMs: [1_000],
            maxAttempts: 2,
            onSettled,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();
        queue.push(entry());
        return { queue, scheduler };
    };

    it('2xx로 큐를 비운 뒤에 부른다 — 안 부르면 리로드가 전송분을 되살린다', async () => {
        const h = createHarness();
        const onSettled = jest.fn();
        const { queue, scheduler } = build('ok', onSettled, h);

        await scheduler.flushNow();

        expect(queue.size()).toBe(0);
        expect(onSettled).toHaveBeenCalled();
    });

    it('4xx 폐기 뒤에도 부른다', async () => {
        const h = createHarness();
        const onSettled = jest.fn();
        const { queue, scheduler } = build('discard', onSettled, h);

        await scheduler.flushNow();

        expect(queue.size()).toBe(0);
        expect(onSettled).toHaveBeenCalled();
    });

    it('재시도로 넘어갈 때도 부른다', async () => {
        const h = createHarness();
        const onSettled = jest.fn();
        const { scheduler } = build('retry', onSettled, h);

        await scheduler.flushNow();

        expect(onSettled).toHaveBeenCalled();
    });

    it('시도 상한 소진으로 배치를 버린 뒤에도 부른다', async () => {
        const h = createHarness();
        const onSettled = jest.fn();
        const { queue, scheduler } = build('retry', onSettled, h);

        await scheduler.flushNow();
        onSettled.mockClear();
        await h.fire();

        expect(queue.size()).toBe(0);
        expect(onSettled).toHaveBeenCalled();
    });
});

describe('createLogUploadScheduler — 백오프 무단 통과 방지 (회귀)', () => {
    it('백오프 중에는 크기 트리거로도 보내지 않는다 — 시도 예산이 한순간에 소진된다', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('retry');
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send,
            batchSize: 2,
            backoffMs: [120_000],
            maxAttempts: 99,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();
        [entry(), entry()].forEach(e => queue.push(e));

        await scheduler.flushNow();
        expect(send).toHaveBeenCalledTimes(1);
        expect(h.dueIn()).toBe(120_000);

        // Busy app: the size threshold is met again immediately.
        for (let i = 0; i < 4; i += 1) {
            const e = entry();
            queue.push(e);
            scheduler.notify(e);
            await Promise.resolve();
            await Promise.resolve();
        }

        expect(send).toHaveBeenCalledTimes(1);
        expect(h.dueIn()).toBe(120_000);
    });

    it('포기할 때 실제로 보낸 그 배치만 버린다 — 다시 구성하면 안 보낸 것까지 지운다', async () => {
        // `attempts` is per-scheduler, not per-batch, so a batch recomposed on a
        // later attempt legitimately includes newer entries — they were sent.
        // What must not happen is give-up recomposing a *fresh* batch and
        // dropping entries the failed request never carried.
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('retry');
        const onGiveUp = jest.fn();
        const scheduler = createLogUploadScheduler({
            source: createQueueUploadSource(queue),
            send,
            batchSize: 2,
            backoffMs: [1_000],
            maxAttempts: 2,
            onGiveUp,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();
        [entry(), entry(), entry(), entry()].forEach(e => queue.push(e));

        await scheduler.flushNow();
        await h.fire();

        const lastSent = send.mock.calls.at(-1)?.[0] ?? [];
        expect(onGiveUp.mock.calls[0][0]).toEqual(lastSent);
        // Only the attempted batch left; the rest of the queue survives.
        expect(queue.size()).toBe(4 - lastSent.length);
    });
});

describe('createLogUploadScheduler — 소스 포트 (ADR-0063)', () => {
    it('fetch가 실패하면 아무것도 보내지 않고 다음 주기를 예약한다 — 소스는 놓아준 게 없다', async () => {
        const h = createHarness();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('ok');
        const scheduler = createLogUploadScheduler({
            source: {
                fetch: async () => {
                    throw new Error('bridge timeout');
                },
                ack: async () => undefined,
            },
            send,
            intervalMs: 60_000,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();

        await scheduler.flushNow();

        expect(send).not.toHaveBeenCalled();
        expect(h.dueIn()).toBe(60_000);
    });

    it('전송 성공 후 ack이 실패해도 파이프라인이 멈추지 않는다', async () => {
        // ack 실패는 삼킨다. 소스가 엔트리를 계속 들고 있으므로 다음 주기에 다시
        // 나가고, 서버의 id 업서트가 중복을 흡수한다. 던지면 타이머를 못 걸어
        // 파이프라인이 영구히 조용해진다 — 중복 요청보다 나쁜 결과다.
        const h = createHarness();
        const held = [entry()];
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('ok');
        const scheduler = createLogUploadScheduler({
            source: {
                fetch: async limit => held.slice(0, limit),
                ack: async () => {
                    throw new Error('ack failed');
                },
            },
            send,
            intervalMs: 60_000,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();

        await scheduler.flushNow();

        expect(send).toHaveBeenCalledTimes(1);
        expect(h.dueIn()).toBe(60_000);
    });

    it('pendingSize를 못 주는 소스는 크기 트리거가 없다 — 주기·생명주기로만 나간다', async () => {
        // 브릿지 소스가 이 경우다. 매 로그마다 크기를 물어보면 배치의 존재 이유가 사라진다.
        const h = createHarness();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('ok');
        const scheduler = createLogUploadScheduler({
            source: {
                fetch: async () => [entry()],
                ack: async () => undefined,
            },
            send,
            batchSize: 1,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();

        scheduler.notify(entry());
        scheduler.notify(entry());
        await Promise.resolve();

        expect(send).not.toHaveBeenCalled();

        await h.fire();
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('겹친 flush가 같은 배치를 두 번 보내지 않는다 — 비파괴 fetch의 함정', async () => {
        // fetch가 비파괴라 진행 중 flush를 막지 않으면 두 사이클이 같은 배치를
        // 집어 두 번 전송한다. 서버는 id 업서트로 버티지만 대역폭과 시도 횟수는 우리 몫이다.
        const h = createHarness();
        const held = [entry()];
        let resolveSend: ((outcome: UploadOutcome) => void) | undefined;
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockImplementation(
            () =>
                new Promise<UploadOutcome>(resolve => {
                    resolveSend = resolve;
                })
        );
        const scheduler = createLogUploadScheduler({
            source: {
                fetch: async limit => held.slice(0, limit),
                ack: async () => undefined,
            },
            send,
            now: h.now,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();

        const first = scheduler.flushNow();
        await Promise.resolve();
        await Promise.resolve();
        // 첫 사이클이 send에서 대기 중인 상태로 두 번째 flush를 시도한다.
        await scheduler.flushNow();

        expect(send).toHaveBeenCalledTimes(1);

        resolveSend?.('ok');
        await first;
    });
});
