import { createLogId } from './id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('createLogId', () => {
    const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

    const stubCrypto = (value: unknown): void => {
        Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true });
    };

    afterEach(() => {
        if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
        else delete (globalThis as { crypto?: unknown }).crypto;
    });

    it('randomUUID를 쓸 수 있으면 그 값을 그대로 돌려준다', () => {
        stubCrypto({ randomUUID: () => 'fixed-uuid-from-platform' });

        expect(createLogId()).toBe('fixed-uuid-from-platform');
    });

    it('randomUUID가 던지면 getRandomValues로 내려가 v4 형식을 만든다', () => {
        // Some WebViews expose randomUUID but reject it outside a secure context.
        stubCrypto({
            randomUUID: () => {
                throw new Error('insecure context');
            },
            getRandomValues: (array: Uint8Array) => {
                array.fill(0xab);
                return array;
            },
        });

        expect(createLogId()).toMatch(UUID_V4);
    });

    it('crypto가 아예 없어도 v4 형식을 만든다 (Hermes·구형 WebView)', () => {
        stubCrypto(undefined);

        expect(createLogId()).toMatch(UUID_V4);
    });

    it('연속 호출이 서로 다른 값을 낸다 — dedup 키라 충돌하면 로그가 덮어써진다', () => {
        stubCrypto(undefined);

        const ids = new Set(Array.from({ length: 500 }, () => createLogId()));

        expect(ids.size).toBe(500);
    });
});
