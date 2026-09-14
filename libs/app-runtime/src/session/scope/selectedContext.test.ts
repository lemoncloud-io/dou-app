import { deriveSelectedContext } from './selectedContext';

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

describe('deriveSelectedContext — 파생 규칙 (useRuntimeBinding에서 옮겨온 식)', () => {
    it('선택된 클라우드와 사용자로 스코프를 만든다 — 사이트는 넣지 않는다', () => {
        // 스코프는 저장 파티션과 같은 모양(`{cid, uid}`)이다. 사이트는 호출자가 인자로 지목하는
        // 값이지 데이터 레이어가 세션에서 주워 오는 값이 아니다 (ADR-0085).
        expect(deriveSelectedContext()).toEqual({ cid: 'c1', uid: 'u1' });
    });

    it('활성 사이트가 있어도 sid 키 자체를 만들지 않는다', () => {
        // `toEqual`은 `sid: undefined`와 키 부재를 구분하지 못하므로 키로 직접 확인한다.
        // 여기서 sid가 다시 생기면 사이트 전환 경합이 그대로 돌아온다.
        expect('sid' in deriveSelectedContext()).toBe(false);
    });

    it('클라우드가 없거나 default면 cid는 default다', () => {
        mockGetGlobalSessionContext.mockReturnValue(session({ cloud: { cloudId: null } }));
        expect(deriveSelectedContext().cid).toBe('default');

        mockGetGlobalSessionContext.mockReturnValue(session({ cloud: { cloudId: 'default' } }));
        expect(deriveSelectedContext().cid).toBe('default');
    });

    it('uid가 없으면 undefined로 남긴다 — 빈 문자열로 바꾸지 않는다', () => {
        mockGetGlobalSessionContext.mockReturnValue(
            session({ activeServer: { siteId: null }, identity: { userId: null } })
        );

        expect(deriveSelectedContext()).toEqual({ cid: 'c1', uid: undefined });
    });

    // 커밋된 값이 아니라 선택값을 따르는 것이 낙관적 전환의 핵심이다. 커밋 뷰는
    // ActiveScope.committed가 따로 들고 있다.
    it('커밋 여부와 무관하게 선택된 클라우드를 따른다 (낙관적 전환)', () => {
        mockGetGlobalSessionContext.mockReturnValue(
            session({ cloud: { cloudId: 'target' }, activeServer: { siteId: 'site-1', cloudId: 'outgoing' } })
        );

        expect(deriveSelectedContext().cid).toBe('target');
    });
});

describe('deriveSelectedContext — 읽기 시점', () => {
    // 이 계약이 변경의 핵심이다: 예전에는 홀더에 밀어 넣은 값이라 effect가 돌기 전까지 낡은 채였고,
    // 그래서 하위 훅들이 contextOverride로 우회했다.
    it('호출할 때마다 스토어를 다시 읽는다 — 값을 캐시하지 않는다', () => {
        expect(deriveSelectedContext().cid).toBe('c1');

        mockGetGlobalSessionContext.mockReturnValue(session({ cloud: { cloudId: 'c2' } }));

        expect(deriveSelectedContext().cid).toBe('c2');
        expect(mockGetGlobalSessionContext).toHaveBeenCalledTimes(2);
    });
});
