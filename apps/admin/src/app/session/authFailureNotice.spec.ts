/**
 * `session/authFailureNotice.spec.ts`
 *
 * The store exists so one expiry produces one banner, no matter how many requests it kills at
 * once — that coalescing is the only real behavior here, so it is what the cases pin.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authFailureNotice } from './authFailureNotice';

beforeEach(() => authFailureNotice.clear());

describe('authFailureNotice', () => {
    it('기본값은 조용하다', () => {
        expect(authFailureNotice.getSnapshot()).toBe(false);
    });

    it('raise하면 구독자에게 한 번 알린다', () => {
        const listener = vi.fn();
        authFailureNotice.subscribe(listener);

        authFailureNotice.raise();

        expect(authFailureNotice.getSnapshot()).toBe(true);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('만료 하나가 요청 여러 개를 죽여도 알림은 한 번이다', () => {
        const listener = vi.fn();
        authFailureNotice.subscribe(listener);

        authFailureNotice.raise();
        authFailureNotice.raise();
        authFailureNotice.raise();

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('구독을 해지하면 더 받지 않는다', () => {
        const listener = vi.fn();
        const unsubscribe = authFailureNotice.subscribe(listener);

        unsubscribe();
        authFailureNotice.raise();

        expect(listener).not.toHaveBeenCalled();
    });

    it('clear는 조용한 상태에서 아무 일도 하지 않는다 — 헛된 리렌더를 만들지 않는다', () => {
        const listener = vi.fn();
        authFailureNotice.subscribe(listener);

        authFailureNotice.clear();

        expect(listener).not.toHaveBeenCalled();
    });
});
