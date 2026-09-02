import { createHttpManager } from './HttpManager';
import { getHttpManager, resetHttpManager } from './factory';

jest.mock('./HttpManager', () => ({ createHttpManager: jest.fn(() => ({ client: true })) }));
jest.mock('./transport', () => ({ webTransport: { surface: true } }));

const mockIsStale = jest.fn(() => false);
jest.mock('../session/auth/credentialFreshness', () => ({
    credentialFreshness: { isStale: (...a: unknown[]) => mockIsStale(...(a as [])), timeToExpiry: jest.fn() },
}));

const mockedCreate = createHttpManager as jest.MockedFunction<typeof createHttpManager>;

beforeEach(() => {
    jest.clearAllMocks();
    resetHttpManager();
});

/** The staleness port the factory handed to the manager. */
const portPassedIn = () => {
    getHttpManager();
    return mockedCreate.mock.calls[0][1] as { isStale(route: string): boolean };
};

describe('getHttpManager — 인스턴스', () => {
    it('한 번 만들고 재사용한다', () => {
        expect(getHttpManager()).toBe(getHttpManager());
        expect(mockedCreate).toHaveBeenCalledTimes(1);
    });

    it('resetHttpManager()가 다음 호출에서 다시 만들게 한다 — 테스트 심', () => {
        getHttpManager();
        resetHttpManager();
        getHttpManager();

        expect(mockedCreate).toHaveBeenCalledTimes(2);
    });
});

// 이 바인딩이 `http/`가 app-runtime 안에서 leaf일 수 있는 이유다. 세션을 아는 파일은 여기 하나뿐.
describe('자격증명 신선도 포트 — 어떤 route를 물어도 relay로 답한다', () => {
    // relay가 유일한 서명 route이고, oauth·iap은 자기 자격증명이 없어 relay 것으로 서명한다.
    // 이 매핑이 어댑터가 존재하는 이유다 — 포트는 route로 묻고 측정기는 소유자로 답한다.
    it.each(['relay', 'oauth', 'iap'] as const)('%s를 물어도 relay 자격증명을 본다', route => {
        portPassedIn().isStale(route);

        expect(mockIsStale).toHaveBeenCalledWith('relay');
    });

    it('측정 결과를 그대로 전달한다', () => {
        mockIsStale.mockReturnValue(true);

        expect(portPassedIn().isStale('relay')).toBe(true);
    });
});
