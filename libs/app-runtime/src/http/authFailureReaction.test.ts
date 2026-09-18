/**
 * The registry's whole job is that an app can replace the reaction WITHOUT any app inheriting a
 * change it did not ask for — so the default is pinned here as tightly as the override.
 */
import { authFailureReaction } from './authFailureReaction';

const mockWarn = jest.fn();
jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: (...a: unknown[]) => mockWarn(...(a as [])), error: jest.fn() },
}));

beforeEach(() => {
    jest.clearAllMocks();
    authFailureReaction.register(null);
    window.alert = jest.fn();
});

afterAll(() => authFailureReaction.register(null));

describe('authFailureReaction — 기본 동작 (등록하지 않은 앱)', () => {
    // This port has never actually been called before (`withRetry` was its only caller, and that was
    // dead code). Now the client really does call it, so an app that hasn't registered must not
    // suddenly gain a logout behavior it never had.
    it('아무것도 하지 않는다 — 등록하지 않은 앱의 동작은 그대로여야 한다', () => {
        authFailureReaction.react(new Error('boom'), '요청 실패');

        expect(window.alert).not.toHaveBeenCalled();
    });
});

describe('authFailureReaction — 앱이 등록한 반응', () => {
    it('등록한 반응을 부른다', () => {
        const reaction = jest.fn();
        authFailureReaction.register(reaction);

        authFailureReaction.react(new Error('boom'), '요청 실패');

        expect(reaction).toHaveBeenCalledWith(expect.any(Error), '요청 실패');
    });

    it('null로 되돌리면 앱 반응은 더 이상 불리지 않는다', () => {
        const reaction = jest.fn();
        authFailureReaction.register(reaction);
        authFailureReaction.register(null);

        authFailureReaction.react(new Error('boom'), '요청 실패');

        expect(reaction).not.toHaveBeenCalled();
    });

    it('반응이 던져도 삼킨다 — 호출자의 실패를 알림 구현으로 바꿔치기하지 않는다', () => {
        authFailureReaction.register(() => {
            throw new Error('banner blew up');
        });

        expect(() => authFailureReaction.react(new Error('boom'), '요청 실패')).not.toThrow();
        expect(mockWarn).toHaveBeenCalled();
    });
});
