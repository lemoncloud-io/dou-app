import { deriveIntent } from './intent';

const mockGetGlobalSessionContext = jest.fn();

jest.mock('../store', () => ({
    getGlobalSessionContext: () => mockGetGlobalSessionContext(),
}));

const session = (over: Record<string, unknown> = {}) => ({
    activeServer: { siteId: 'site-1' },
    cloud: { cloudId: 'c1' },
    identity: { userId: 'u1' },
    ...over,
});

beforeEach(() => {
    jest.clearAllMocks();
    mockGetGlobalSessionContext.mockReturnValue(session());
});

describe('deriveIntent — 파생 규칙 (useRuntimeBinding에서 옮겨온 식)', () => {
    it('선택된 클라우드·활성 사이트·사용자로 스코프를 만든다', () => {
        expect(deriveIntent()).toEqual({ cid: 'c1', sid: 'site-1', uid: 'u1' });
    });

    it('클라우드가 없거나 default면 cid는 default다', () => {
        mockGetGlobalSessionContext.mockReturnValue(session({ cloud: { cloudId: null } }));
        expect(deriveIntent().cid).toBe('default');

        mockGetGlobalSessionContext.mockReturnValue(session({ cloud: { cloudId: 'default' } }));
        expect(deriveIntent().cid).toBe('default');
    });

    it('sid·uid가 없으면 undefined로 남긴다 — 빈 문자열로 바꾸지 않는다', () => {
        mockGetGlobalSessionContext.mockReturnValue(
            session({ activeServer: { siteId: null }, identity: { userId: null } })
        );

        expect(deriveIntent()).toEqual({ cid: 'c1', sid: undefined, uid: undefined });
    });

    // 커밋된 값이 아니라 선택값을 따르는 것이 낙관적 전환의 핵심이다. 커밋 뷰는
    // ActiveScope.committed가 따로 들고 있다.
    it('커밋 여부와 무관하게 선택된 클라우드를 따른다 (낙관적 전환)', () => {
        mockGetGlobalSessionContext.mockReturnValue(
            session({ cloud: { cloudId: 'target' }, activeServer: { siteId: 'site-1', cloudId: 'outgoing' } })
        );

        expect(deriveIntent().cid).toBe('target');
    });
});

describe('deriveIntent — 읽기 시점', () => {
    // 이 계약이 변경의 핵심이다: 예전에는 홀더에 밀어 넣은 값이라 effect가 돌기 전까지 낡은 채였고,
    // 그래서 하위 훅들이 contextOverride로 우회했다.
    it('호출할 때마다 스토어를 다시 읽는다 — 값을 캐시하지 않는다', () => {
        expect(deriveIntent().cid).toBe('c1');

        mockGetGlobalSessionContext.mockReturnValue(session({ cloud: { cloudId: 'c2' } }));

        expect(deriveIntent().cid).toBe('c2');
        expect(mockGetGlobalSessionContext).toHaveBeenCalledTimes(2);
    });
});
