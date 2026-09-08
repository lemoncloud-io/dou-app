import { ALL_SESSION_SIGNALS, sessionSignal, subscribeSessionSignal } from './signal';

describe('SessionSignal — 종류별 구독 (ADR-0076 결정 2)', () => {
    it('구독한 종류가 움직일 때만 부른다', () => {
        const relayOnly = jest.fn();
        const off = sessionSignal.subscribe(['relay:token'], relayOnly);

        sessionSignal.emit('cloud:token');
        expect(relayOnly).not.toHaveBeenCalled();

        sessionSignal.emit('relay:token');
        expect(relayOnly).toHaveBeenCalledTimes(1);
        off();
    });

    it('구독 해제하면 더 이상 부르지 않는다', () => {
        const listener = jest.fn();
        sessionSignal.subscribe(['identity'], listener)();
        sessionSignal.emit('identity');
        expect(listener).not.toHaveBeenCalled();
    });
});

describe('SessionSignal — batch', () => {
    it('배치 안의 emit 여러 개가 fan-out 한 번이 된다', () => {
        const listener = jest.fn();
        const off = sessionSignal.subscribe(ALL_SESSION_SIGNALS, listener);

        sessionSignal.batch(() => {
            sessionSignal.emit('selection');
            sessionSignal.emit('cloud:token');
            sessionSignal.emit('identity');
        });

        expect(listener).toHaveBeenCalledTimes(1);
        off();
    });

    it('중첩 배치는 가장 바깥만 flush한다', () => {
        const listener = jest.fn();
        const off = sessionSignal.subscribe(['selection'], listener);

        sessionSignal.batch(() => {
            sessionSignal.batch(() => sessionSignal.emit('selection'));
            expect(listener).not.toHaveBeenCalled(); // 안쪽에서는 아직
            sessionSignal.emit('selection');
        });

        expect(listener).toHaveBeenCalledTimes(1);
        off();
    });

    it('배치가 throw해도 이미 일어난 쓰기는 통지한다 — 관측자를 stale로 두지 않는다', () => {
        const listener = jest.fn();
        const off = sessionSignal.subscribe(['selection'], listener);

        expect(() =>
            sessionSignal.batch(() => {
                sessionSignal.emit('selection');
                throw new Error('boom');
            })
        ).toThrow('boom');

        expect(listener).toHaveBeenCalledTimes(1);
        off();
    });

    it('무효화기는 배치 안에서도 즉시 돈다 — 배치 내부 읽기가 최신을 봐야 한다', () => {
        const invalidate = jest.fn();
        sessionSignal.registerInvalidator(invalidate);
        const listener = jest.fn();
        const off = sessionSignal.subscribe(['selection'], listener);

        sessionSignal.batch(() => {
            sessionSignal.emit('selection');
            // A12(getCloudSessionSnapshot)가 캐시를 지나므로 여기서 이미 캐시가 떨어져 있어야 한다.
            expect(invalidate).toHaveBeenCalled();
            expect(listener).not.toHaveBeenCalled();
        });

        expect(listener).toHaveBeenCalledTimes(1);
        off();
    });
});

// `subscribeSessionSignal` is the all-kinds wrapper the three reader hooks use (`useGlobalSession` ·
// `useSessionAuth` · `useSessionIdentity`). It used to be covered only through the deprecated
// `notifySessionStateChanged` shim; that shim is gone, so the wrapper gets its own case.
describe('subscribeSessionSignal — 전 종류 구독 래퍼', () => {
    it('어느 종류가 움직여도 받는다', () => {
        const listener = jest.fn();
        const off = subscribeSessionSignal(listener);

        for (const kind of ALL_SESSION_SIGNALS) {
            sessionSignal.emit(kind);
        }

        expect(listener).toHaveBeenCalledTimes(ALL_SESSION_SIGNALS.length);
        off();
    });

    it('해지하면 더 받지 않는다', () => {
        const listener = jest.fn();
        subscribeSessionSignal(listener)();

        sessionSignal.emit('relay:token');

        expect(listener).not.toHaveBeenCalled();
    });
});
