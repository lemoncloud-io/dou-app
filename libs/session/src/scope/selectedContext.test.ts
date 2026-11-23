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
        expect(deriveSelectedContext()).toEqual({ cid: 'c1', uid: 'u1' });
    });

    it('활성 사이트가 있어도 sid 키 자체를 만들지 않는다', () => {
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

    it('커밋 여부와 무관하게 선택된 클라우드를 따른다 (낙관적 전환)', () => {
        mockGetGlobalSessionContext.mockReturnValue(
            session({ cloud: { cloudId: 'target' }, activeServer: { siteId: 'site-1', cloudId: 'outgoing' } })
        );

        expect(deriveSelectedContext().cid).toBe('target');
    });
});

describe('deriveSelectedContext — 읽기 시점', () => {
    it('호출할 때마다 스토어를 다시 읽는다 — 값을 캐시하지 않는다', () => {
        expect(deriveSelectedContext().cid).toBe('c1');

        mockGetGlobalSessionContext.mockReturnValue(session({ cloud: { cloudId: 'c2' } }));

        expect(deriveSelectedContext().cid).toBe('c2');
        expect(mockGetGlobalSessionContext).toHaveBeenCalledTimes(2);
    });
});
