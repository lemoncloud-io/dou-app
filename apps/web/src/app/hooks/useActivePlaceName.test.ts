import { act, renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionSelection } from '@chatic/web-core';

import { useActivePlaceName } from './useActivePlaceName';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
}));

jest.mock('@chatic/web-core', () => ({
    useSessionSelection: jest.fn(),
}));

// Echo the key so the branded-label branch is identifiable without loading i18n resources.
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const useRuntimeRepositoriesMock = useRuntimeRepositories as jest.Mock;
const useSessionSelectionMock = useSessionSelection as jest.Mock;

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

    // ADR-0040: relay의 개인 플레이스는 백엔드 이름이 'default'/'#default'다. 그 원문이 프로필
    // 다이얼로그 제목으로 새지 않아야 한다.
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

    // 브랜딩 이후 stale 행은 단순히 낡은 것이 아니라 '틀린' 답을 낸다 — 보관된 relay 행의
    // id가 '0000'이라 다른 클라우드에서도 계속 '두유 홈'이라고 답한다.
    it('사이트가 바뀌면 이전 행을 즉시 버린다', () => {
        useSessionSelectionMock.mockReturnValue({ selectedSiteId: '0000', selectedCloudId: 'default' });
        const { result, rerender } = renderHook(() => useActivePlaceName());

        act(() => observeItem.mock.calls[0][1]({ id: '0000', name: '#default' }));
        expect(result.current).toBe('placeList.defaultPlace');

        // 다른 클라우드의 플레이스로 전환 — 새 구독이 emit하기 전 상태.
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

        // place-sync는 매 tick마다 새 객체를 준다. 상한을 +1로 두는 것은 React가 같은 값을 반환한
        // updater에 대해 bail-out 직전 한 번 더 렌더할 수 있다고 문서화돼 있기 때문 — 동일 emit
        // 3회가 3회 렌더로 이어지지 않는다는 것이 이 테스트가 지키는 것이다.
        emit();
        emit();
        emit();
        expect(renders).toBeLessThanOrEqual(after + 1);
    });
});
