import { createLogUploadQueue } from './LogUploadQueue';
import { createQueueLogStore } from './QueueLogStore';
import { createLogUploadScheduler } from './LogUploadScheduler';
import { DEFAULT_MAX_ATTEMPTS } from './uploadPolicy';
import type { UploadOutcome } from './uploadPolicy';
import type { LogEntry, LogLevel } from '../core/types';

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

describe('createLogUploadScheduler — 주기 트리거', () => {
    it('주기가 오면 쌓인 것을 보낸다', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn(async (): Promise<UploadOutcome> => 'ok');
        const scheduler = createLogUploadScheduler({
            store: createQueueLogStore(queue),
            send,
            schedule: h.schedule,
            cancel: h.cancel,
        });

        queue.push(entry());
        scheduler.start();
        await h.fire();

        expect(send).toHaveBeenCalledTimes(1);
    });

    it('엔트리가 아무리 쌓여도 주기 전에는 보내지 않는다 — 크기 트리거는 없다', async () => {
        // notify가 사라진 결과다. 업로더는 엔트리를 관찰하지 않으므로(원칙 16)
        // 큐가 얼마나 찼는지 알 방법이 없고, 알 필요도 없다.
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn(async (): Promise<UploadOutcome> => 'ok');
        const scheduler = createLogUploadScheduler({
            store: createQueueLogStore(queue),
            send,
            schedule: h.schedule,
            cancel: h.cancel,
        });

        scheduler.start();
        for (let i = 0; i < 200; i += 1) queue.push(entry());
        await Promise.resolve();

        expect(send).not.toHaveBeenCalled();
    });

    it('error가 쌓여도 앞당기지 않는다 — 즉시성은 Crashlytics 리스너의 몫이다', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn(async (): Promise<UploadOutcome> => 'ok');
        const scheduler = createLogUploadScheduler({
            store: createQueueLogStore(queue),
            send,
            schedule: h.schedule,
            cancel: h.cancel,
        });

        scheduler.start();
        const armedBefore = h.dueIn();
        queue.push(entry('error'));
        await Promise.resolve();

        expect(send).not.toHaveBeenCalled();
        expect(h.dueIn()).toBe(armedBefore);
    });

    it('flushNow는 강제로 보낸다 (pagehide·로그아웃)', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn(async (): Promise<UploadOutcome> => 'ok');
        const scheduler = createLogUploadScheduler({
            store: createQueueLogStore(queue),
            send,
            schedule: h.schedule,
            cancel: h.cancel,
        });

        queue.push(entry());
        scheduler.start();
        await scheduler.flushNow();

        expect(send).toHaveBeenCalledTimes(1);
    });

    it('보낼 게 없으면 요청하지 않는다 — 유휴 기기가 주기마다 빈 요청을 쏘면 안 된다', async () => {
        const h = createHarness();
        const send = jest.fn(async (): Promise<UploadOutcome> => 'ok');
        const scheduler = createLogUploadScheduler({
            store: createQueueLogStore(createLogUploadQueue()),
            send,
            schedule: h.schedule,
            cancel: h.cancel,
        });

        scheduler.start();
        await h.fire();

        expect(send).not.toHaveBeenCalled();
        expect(h.dueIn()).toBeDefined();
    });
});

describe('createLogUploadScheduler — 응답 처리', () => {
    it('2xx면 배치를 큐에서 제거한다', async () => {
        const h = createHarness();
        const queue = createLogUploadQueue();
        const scheduler = createLogUploadScheduler({
            store: createQueueLogStore(queue),
            send: jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('ok'),
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
            store: createQueueLogStore(queue),
            send,
            intervalMs: 60_000,
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
            store: createQueueLogStore(queue),
            send,
            backoffMs: [5_000, 30_000, 120_000],
            maxAttempts: 5,
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
            store: createQueueLogStore(queue),
            send,
            backoffMs: [5_000],
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
            store: createQueueLogStore(queue),
            send,
            backoffMs: [1_000],
            maxAttempts: 3,
            intervalMs: 60_000,
            onGiveUp,
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
            store: createQueueLogStore(queue),
            send,
            backoffMs: [1_000],
            maxAttempts: 2,
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
            store: createQueueLogStore(queue),
            send,
            isEnabled: () => false,
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
            store: createQueueLogStore(queue),
            send: jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('ok'),
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
            store: createQueueLogStore(queue),
            send: jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue(outcome),
            backoffMs: [1_000],
            maxAttempts: 2,
            onSettled,
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
    it('백오프 중에 엔트리가 아무리 쌓여도 사다리를 뛰어넘지 않는다', async () => {
        // 원래 이 회귀는 notify의 크기 트리거가 백오프를 무시하고 재발사해
        // 시도 예산을 한순간에 태우는 것이었다. notify가 사라져 그 경로 자체가
        // 없어졌지만, 성질은 그대로 고정해 둔다 — 주기 외에 보내는 길이 다시
        // 생기면 여기서 걸린다.
        const h = createHarness();
        const queue = createLogUploadQueue();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('retry');
        const scheduler = createLogUploadScheduler({
            store: createQueueLogStore(queue),
            send,
            batchSize: 2,
            backoffMs: [120_000],
            maxAttempts: 99,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();
        [entry(), entry()].forEach(e => queue.push(e));

        await scheduler.flushNow();
        expect(send).toHaveBeenCalledTimes(1);
        expect(h.dueIn()).toBe(120_000);

        // Busy app: entries keep arriving while the ladder is counting down.
        for (let i = 0; i < 8; i += 1) {
            queue.push(entry());
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
            store: createQueueLogStore(queue),
            send,
            batchSize: 2,
            backoffMs: [1_000],
            maxAttempts: 2,
            onGiveUp,
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

describe('createLogUploadScheduler — 저장소 포트', () => {
    it('peek이 실패하면 아무것도 보내지 않고 다음 주기를 예약한다 — 저장소는 놓아준 게 없다', async () => {
        const h = createHarness();
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('ok');
        const scheduler = createLogUploadScheduler({
            store: {
                peek: async () => {
                    throw new Error('bridge timeout');
                },
                ack: async () => undefined,
                clear: async () => undefined,
                size: () => 0,
            },
            send,
            intervalMs: 60_000,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();

        await scheduler.flushNow();

        expect(send).not.toHaveBeenCalled();
        expect(h.dueIn()).toBe(60_000);
    });

    it('전송 성공 후 ack이 실패해도 파이프라인이 멈추지 않는다', async () => {
        // ack 실패는 삼킨다. 저장소가 엔트리를 계속 들고 있으므로 다음 주기에 다시
        // 나가고, 서버의 id 업서트가 중복을 흡수한다. 던지면 타이머를 못 걸어
        // 파이프라인이 영구히 조용해진다 — 중복 요청보다 나쁜 결과다.
        const h = createHarness();
        const held = [entry()];
        const send = jest.fn<Promise<UploadOutcome>, [LogEntry[]]>().mockResolvedValue('ok');
        const scheduler = createLogUploadScheduler({
            store: {
                peek: async limit => held.slice(0, limit),
                ack: async () => {
                    throw new Error('ack failed');
                },
                clear: async () => undefined,
                size: () => held.length,
            },
            send,
            intervalMs: 60_000,
            schedule: h.schedule,
            cancel: h.cancel,
        });
        scheduler.start();

        await scheduler.flushNow();

        expect(send).toHaveBeenCalledTimes(1);
        expect(h.dueIn()).toBe(60_000);
    });

    it('겹친 flush가 같은 배치를 두 번 보내지 않는다 — 비파괴 peek의 함정', async () => {
        // peek이 비파괴라 진행 중 flush를 막지 않으면 두 사이클이 같은 배치를
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
            store: {
                peek: async limit => held.slice(0, limit),
                ack: async () => undefined,
                clear: async () => undefined,
                size: () => held.length,
            },
            send,
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
