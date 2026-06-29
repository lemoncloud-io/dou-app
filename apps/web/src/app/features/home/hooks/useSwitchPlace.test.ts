import { renderHook } from '@testing-library/react';

import { useSessionSelection, useSiteSwitch } from '@chatic/web-core';
import type { DomainPlace } from '@chatic/data';

import { useSwitchPlace } from './useSwitchPlace';

jest.mock('@chatic/web-core', () => ({ useSessionSelection: jest.fn(), useSiteSwitch: jest.fn() }));

const switchSiteMock = jest.fn();

const place = (id: string): DomainPlace => ({ id }) as unknown as DomainPlace;

const setSession = (selectedSiteId: string | null, isSwitching = false) => {
    (useSessionSelection as jest.Mock).mockReturnValue({ selectedSiteId, selectedCloudId: 'default' });
    (useSiteSwitch as jest.Mock).mockReturnValue({ switchSite: switchSiteMock, isSwitching });
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('useSwitchPlace — 플레이스 전환', () => {
    it('활성 플레이스가 없으면 첫 플레이스를 자동 선택한다', () => {
        setSession(null);
        renderHook(() => useSwitchPlace([place('p1'), place('p2')]));
        expect(switchSiteMock).toHaveBeenCalledWith('p1');
    });

    it('이미 선택된 플레이스가 있으면 자동 선택하지 않는다', () => {
        setSession('p2');
        renderHook(() => useSwitchPlace([place('p1'), place('p2')]));
        expect(switchSiteMock).not.toHaveBeenCalled();
    });

    it('switchPlace는 현재 선택과 같은 id면 무시한다', () => {
        setSession('p1');
        const { result } = renderHook(() => useSwitchPlace([place('p1')]));
        result.current.switchPlace('p1');
        expect(switchSiteMock).not.toHaveBeenCalled();
    });

    it('switchPlace는 전환 중이면 무시한다', () => {
        setSession('p1', true);
        const { result } = renderHook(() => useSwitchPlace([place('p1'), place('p2')]));
        result.current.switchPlace('p2');
        expect(switchSiteMock).not.toHaveBeenCalled();
    });

    it('switchPlace는 다른 플레이스로 전환을 요청한다', () => {
        setSession('p1');
        const { result } = renderHook(() => useSwitchPlace([place('p1'), place('p2')]));
        result.current.switchPlace('p2');
        expect(switchSiteMock).toHaveBeenCalledWith('p2');
    });
});
