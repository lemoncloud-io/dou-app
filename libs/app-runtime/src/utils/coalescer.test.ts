import { Coalescer } from './coalescer';

const deferred = <T>() => {
    let settle!: (v: T) => void;
    let fail!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        settle = res;
        fail = rej;
    });
    return { promise, settle, fail };
};

describe('Coalescer — in-flight 공유', () => {
    it('동시 호출은 시도 하나를 공유한다', async () => {
        const c = new Coalescer<number>();
        const d = deferred<number>();
        const attempt = jest.fn(() => d.promise);

        const a = c.run(attempt);
        const b = c.run(attempt);
        expect(attempt).toHaveBeenCalledTimes(1);

        d.settle(7);
        await expect(a).resolves.toBe(7);
        await expect(b).resolves.toBe(7);
    });

    it('정산 후에는 다시 시도한다 (메모 없음)', async () => {
        const c = new Coalescer<number>();
        const attempt = jest.fn().mockResolvedValue(1);
        await c.run(attempt);
        await c.run(attempt);
        expect(attempt).toHaveBeenCalledTimes(2);
    });

    it('rejection 은 전파되고 다음 호출은 새로 시도한다 — 실패를 메모하지 않는다', async () => {
        const c = new Coalescer<number>({ memoMs: 10_000, now: () => 0 });
        const attempt = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(3);

        await expect(c.run(attempt)).rejects.toThrow('boom');
        await expect(c.run(attempt)).resolves.toBe(3);
        expect(attempt).toHaveBeenCalledTimes(2);
    });
});

describe('Coalescer — 결과 메모 (버스트 흡수기)', () => {
    it('창 안에서는 방금 정산된 답을 그대로 준다', async () => {
        let now = 0;
        const c = new Coalescer<boolean>({ memoMs: 3_000, now: () => now });
        const attempt = jest.fn().mockResolvedValue(false);

        await expect(c.run(attempt)).resolves.toBe(false);
        now = 2_999;
        await expect(c.run(attempt)).resolves.toBe(false);
        expect(attempt).toHaveBeenCalledTimes(1);
    });

    it('창이 지나면 다시 시도한다 — 캐시가 아니다', async () => {
        let now = 0;
        const c = new Coalescer<boolean>({ memoMs: 3_000, now: () => now });
        const attempt = jest.fn().mockResolvedValue(true);

        await c.run(attempt);
        now = 3_000;
        await c.run(attempt);
        expect(attempt).toHaveBeenCalledTimes(2);
    });

    it('reset 은 공유 시도와 메모를 모두 버린다', async () => {
        const c = new Coalescer<boolean>({ memoMs: 3_000, now: () => 0 });
        const attempt = jest.fn().mockResolvedValue(true);
        await c.run(attempt);
        c.reset();
        await c.run(attempt);
        expect(attempt).toHaveBeenCalledTimes(2);
    });
});
