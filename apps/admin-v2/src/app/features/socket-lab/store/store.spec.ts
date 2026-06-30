import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from './store';

describe('demo/createMemoryStore', () => {
    it('upsert/read/readAll 동작 + version 증가 + 구독 통지', () => {
        const store = createMemoryStore<number>();
        const listener = vi.fn();
        const unsub = store.subscribe(listener);

        expect(store.version()).toBe(0);
        store.upsert('a', 1);
        expect(store.read('a')).toBe(1);
        expect(store.version()).toBe(1);
        expect(listener).toHaveBeenCalledTimes(1);

        store.upsert('b', 2);
        expect([...store.readAll().entries()]).toEqual([
            ['a', 1],
            ['b', 2],
        ]);
        expect(store.version()).toBe(2);

        unsub();
        store.upsert('c', 3);
        expect(listener).toHaveBeenCalledTimes(2); // 구독 해제 후 통지 없음
    });

    it('remove/clear 도 version 증가 + 통지(변화 있을 때만)', () => {
        const store = createMemoryStore<string>();
        const listener = vi.fn();
        store.subscribe(listener);

        store.upsert('x', 'hello');
        store.remove('x');
        expect(store.read('x')).toBeUndefined();
        expect(listener).toHaveBeenCalledTimes(2);

        store.remove('nope'); // 없는 키 → 변화 없음 → 통지 없음
        expect(listener).toHaveBeenCalledTimes(2);

        store.upsert('y', 'world');
        store.clear();
        expect(store.readAll().size).toBe(0);
        expect(listener).toHaveBeenCalledTimes(4);
    });

    it('캐시 DB backing 으로 write-through(fire-and-forget) 한다', () => {
        const write = vi.fn().mockResolvedValue(undefined);
        const store = createMemoryStore<number>({ write });
        store.upsert('k', 42);
        expect(write).toHaveBeenCalledWith('k', 42);
        expect(store.read('k')).toBe(42); // mirror 가 정본
    });

    it('backing.write 실패해도 mirror/통지에 영향 없음', () => {
        const write = vi.fn().mockRejectedValue(new Error('db down'));
        const store = createMemoryStore<number>({ write });
        const listener = vi.fn();
        store.subscribe(listener);
        expect(() => store.upsert('k', 1)).not.toThrow();
        expect(store.read('k')).toBe(1);
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
