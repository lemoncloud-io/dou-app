import { JsonSlot, type StorageLike } from './jsonSlot';

const fakeStorage = () => {
    const map = new Map<string, string>();
    const get = jest.fn((k: string) => map.get(k) ?? null);
    const storage: StorageLike = {
        get,
        set: (k, v) => void map.set(k, v),
        remove: k => void map.delete(k),
    };
    return { storage, get, map };
};

describe('JsonSlot — 파싱 메모', () => {
    it('같은 raw 문자열이면 파싱 결과를 재사용한다 (읽기는 매번 스토리지로 간다)', () => {
        const { storage, get } = fakeStorage();
        const slot = new JsonSlot<{ a: number }>(storage, 'k');
        slot.write({ a: 1 });

        const first = slot.read();
        const second = slot.read();

        expect(first).toEqual({ a: 1 });
        // Same object reference = proof the second read didn't parse again
        expect(second).toBe(first);
        // Storage is still read every time, though — the memo must not become observable
        expect(get).toHaveBeenCalledTimes(2);
    });

    it('raw 가 바뀌면 다시 파싱한다 — 밖에서 쓴 값도 보인다', () => {
        const { storage, map } = fakeStorage();
        const slot = new JsonSlot<{ a: number }>(storage, 'k');
        slot.write({ a: 1 });
        expect(slot.read()).toEqual({ a: 1 });

        // Simulates something outside this package overwriting the same key
        map.set('k', JSON.stringify({ a: 2 }));

        expect(slot.read()).toEqual({ a: 2 });
    });

    it('값이 사라지면 null 이고 메모도 버린다', () => {
        const { storage, map } = fakeStorage();
        const slot = new JsonSlot<{ a: number }>(storage, 'k');
        slot.write({ a: 1 });
        slot.read();

        map.delete('k');
        expect(slot.read()).toBeNull();

        // If the same value comes back, it's parsed fresh (the discarded memo isn't revived)
        map.set('k', JSON.stringify({ a: 1 }));
        expect(slot.read()).toEqual({ a: 1 });
    });

    it('clear 는 스토리지와 메모를 함께 비운다', () => {
        const { storage } = fakeStorage();
        const slot = new JsonSlot<{ a: number }>(storage, 'k');
        slot.write({ a: 1 });
        slot.read();
        slot.clear();
        expect(slot.read()).toBeNull();
    });
});
