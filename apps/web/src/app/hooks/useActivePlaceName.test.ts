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
        useSessionSelectionMock.mockReturnValue({ selectedSiteId: null });

        const { result } = renderHook(() => useActivePlaceName());

        expect(result.current).toBe('');
        expect(observeItem).not.toHaveBeenCalled();
    });

    it('selectedSiteId로 구독해 place.name을 반환한다', () => {
        useSessionSelectionMock.mockReturnValue({ selectedSiteId: 's1' });

        const { result } = renderHook(() => useActivePlaceName());

        expect(observeItem).toHaveBeenCalledWith('s1', expect.any(Function));
        act(() => observeItem.mock.calls[0][1]({ id: 's1', name: 'UIUX 스터디' }));
        expect(result.current).toBe('UIUX 스터디');
    });

    it('언마운트 시 구독을 해제한다', () => {
        useSessionSelectionMock.mockReturnValue({ selectedSiteId: 's1' });

        const { unmount } = renderHook(() => useActivePlaceName());
        unmount();

        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});
