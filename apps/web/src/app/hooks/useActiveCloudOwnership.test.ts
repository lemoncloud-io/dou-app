import { renderHook } from '@testing-library/react';

import { useRuntimeProfile } from '@chatic/app-runtime';
import { useSessionSelection } from '@chatic/app-runtime';

import { useCloudSessionCatalog } from './useCloudCatalog';

import { useActiveCloudOwnership } from './useActiveCloudOwnership';

jest.mock('./useCloudCatalog', () => ({ useCloudSessionCatalog: jest.fn() }));
jest.mock('@chatic/app-runtime', () => ({
    useRuntimeProfile: jest.fn(),
    useSessionSelection: jest.fn(),
}));

const setup = (opts: {
    selectedCloudId?: string | null;
    isCloudActive?: boolean;
    clouds?: Array<{ id: string; name?: string }>;
    isPendingClouds?: boolean;
}) => {
    // `in` rather than `??`: a deliberate `null` must survive the default.
    const selectedCloudId = 'selectedCloudId' in opts ? opts.selectedCloudId : 'cloud-a';
    (useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId });
    (useRuntimeProfile as jest.Mock).mockReturnValue({ isCloudActive: opts.isCloudActive ?? true });
    (useCloudSessionCatalog as jest.Mock).mockReturnValue({
        clouds: opts.clouds ?? [{ id: 'cloud-a', name: '내 클라우드' }],
        isPendingClouds: opts.isPendingClouds ?? false,
    });
};

beforeEach(() => jest.clearAllMocks());

describe('useActiveCloudOwnership', () => {
    it('활성 클라우드가 relay 카탈로그에 있으면 소유자다', () => {
        setup({});

        const { result } = renderHook(() => useActiveCloudOwnership());

        expect(result.current.isOwner).toBe(true);
        expect(result.current.isCloudSessionReady).toBe(true);
        expect(result.current.activeCloud).toEqual({ id: 'cloud-a', name: '내 클라우드' });
    });

    it('초대받은 클라우드는 카탈로그(view: mine)에 없으므로 소유자가 아니다', () => {
        setup({ clouds: [{ id: 'cloud-other' }] });

        const { result } = renderHook(() => useActiveCloudOwnership());

        expect(result.current.isOwner).toBe(false);
        // The session is still live — only ownership fails, which is what separates the two flags.
        expect(result.current.isCloudSessionReady).toBe(true);
        expect(result.current.activeCloud).toBeUndefined();
    });

    it.each([
        ['default 클라우드', { selectedCloudId: 'default' }],
        ['선택된 클라우드 없음', { selectedCloudId: null }],
        ['클라우드 세션 비활성', { isCloudActive: false }],
    ])('%s이면 세션이 준비되지 않았고 소유자도 아니다', (_label, overrides) => {
        setup(overrides);

        const { result } = renderHook(() => useActiveCloudOwnership());

        expect(result.current.isCloudSessionReady).toBe(false);
        expect(result.current.isOwner).toBe(false);
    });

    it('카탈로그가 아직 로딩 중이면 isPending으로 알린다 (진입점은 숨김, 화면은 판단 보류)', () => {
        setup({ clouds: [], isPendingClouds: true });

        const { result } = renderHook(() => useActiveCloudOwnership());

        expect(result.current.isPending).toBe(true);
        expect(result.current.isOwner).toBe(false);
    });
});
