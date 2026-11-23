import { authFailureReaction } from './authFailureReaction';

const mockWarn = jest.fn();
jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { debug: jest.fn(), info: jest.fn(), warn: (...a: unknown[]) => mockWarn(...(a as [])), error: jest.fn() },
}));

beforeEach(() => {
    jest.clearAllMocks();
    authFailureReaction.register(null);
    window.alert = jest.fn();
});

afterAll(() => authFailureReaction.register(null));

describe('authFailureReaction — 기본 동작 (등록하지 않은 앱)', () => {
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
