import { act, renderHook } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { useActivePlaceName } from './useActivePlaceName';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: jest.fn(),
        },
        session: {
            useSessionSelection: jest.fn(),
        },
    },
}));

// Echo the key so the branded-label branch is identifiable without loading i18n resources.
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const useRuntimeRepositoriesMock = runtime.data.useRuntimeRepositories as jest.Mock;
const useSessionSelectionMock = runtime.session.useSessionSelection as jest.Mock;

const unsubscribe = jest.fn();
const observeItem = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    observeItem.mockReturnValue(unsubscribe);
    useRuntimeRepositoriesMock.mockReturnValue({ place: { observeItem } });
});

describe('useActivePlaceName — 활성 플레이스명 관측', () => {
    it('활성 사이트가 없으면 빈 문자열을 반환하고 구독하지 않는다', () => {
        useSessionSelectionMock.mockReturnValue({ selectedSiteId: null, selectedCloudId: 'cloud-1' });

        const { result } = renderHook(() => useActivePlaceName());

        expect(result.current).toBe('');
        expect(observeItem).not.toHaveBeenCalled();
    });

    it('selectedSiteId로 구독해 place.name을 반환한다', () => {
        useSessionSelectionMock.mockReturnValue({ selectedSiteId: 's1', selectedCloudId: 'cloud-1' });

        const { result } = renderHook(() => useActivePlaceName());

        expect(observeItem).toHaveBeenCalledWith('s1', expect.any(Function));
        act(() => observeItem.mock.calls[0][1]({ id: 's1', name: 'UIUX 스터디' }));
        expect(result.current).toBe('UIUX 스터디');
    });

    it('언마운트 시 구독을 해제한다', () => {
        useSessionSelectionMock.mockReturnValue({ selectedSiteId: 's1', selectedCloudId: 'cloud-1' });

        const { unmount } = renderHook(() => useActivePlaceName());
        unmount();

        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    // ADR-0040: on the relay, the personal place's backend name is 'default'/'#default'. That raw
    // name must not leak into the profile dialog title.
    describe('홈 플레이스 브랜딩', () => {
        it('기본 클라우드에서는 백엔드 원문 대신 브랜드 라벨을 낸다', () => {
            useSessionSelectionMock.mockReturnValue({ selectedSiteId: '0000', selectedCloudId: 'default' });

            const { result } = renderHook(() => useActivePlaceName());

            act(() => observeItem.mock.calls[0][1]({ id: '0000', name: '#default' }));
            expect(result.current).toBe('placeList.defaultPlace');
        });

        it('place 행이 아직 캐시에 없어도 sid로 브랜드 라벨을 낸다 (빈 제목 방지)', () => {
            useSessionSelectionMock.mockReturnValue({ selectedSiteId: '0000', selectedCloudId: 'default' });

            const { result } = renderHook(() => useActivePlaceName());

            expect(result.current).toBe('placeList.defaultPlace');
        });

        it('기본 클라우드가 아니어도 sid가 홈 플레이스면 브랜드 라벨을 낸다', () => {
            useSessionSelectionMock.mockReturnValue({ selectedSiteId: '0000', selectedCloudId: 'cloud-1' });

            const { result } = renderHook(() => useActivePlaceName());

            expect(result.current).toBe('placeList.defaultPlace');
        });
    });

    // Once branding applies, a stale row isn't merely outdated — it gives a "wrong" answer. Because
    // the retained relay row's id is '0000', it keeps answering "두유 홈" ("Doyou Home") even in another cloud.
    it('사이트가 바뀌면 이전 행을 즉시 버린다', () => {
        useSessionSelectionMock.mockReturnValue({ selectedSiteId: '0000', selectedCloudId: 'default' });
        const { result, rerender } = renderHook(() => useActivePlaceName());

        act(() => observeItem.mock.calls[0][1]({ id: '0000', name: '#default' }));
        expect(result.current).toBe('placeList.defaultPlace');

        // Switch to a place in another cloud — the state before the new subscription emits.
        useSessionSelectionMock.mockReturnValue({ selectedSiteId: 's2', selectedCloudId: 'cloud-1' });
        rerender();

        expect(result.current).not.toBe('placeList.defaultPlace');
        expect(result.current).toBe('');
    });

    it('이름이 그대로인 emit은 리렌더를 쌓지 않는다', () => {
        useSessionSelectionMock.mockReturnValue({ selectedSiteId: 's1', selectedCloudId: 'cloud-1' });
        let renders = 0;
        const { result } = renderHook(() => {
            renders += 1;
            return useActivePlaceName();
        });

        const emit = () => act(() => observeItem.mock.calls[0][1]({ id: 's1', name: '우리 팀' }));
        emit();
        const after = renders;
        expect(result.current).toBe('우리 팀');

        // place-sync hands back a new object on every tick. The ceiling is set to +1 because React is
        // documented to potentially render once more right before bailing out for an updater that
        // returns the same value — what this test guards is that 3 identical emits don't turn into 3
        // renders.
        emit();
        emit();
        emit();
        expect(renders).toBeLessThanOrEqual(after + 1);
    });
});
