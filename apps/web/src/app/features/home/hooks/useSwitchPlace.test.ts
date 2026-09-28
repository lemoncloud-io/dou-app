import { renderHook } from '@testing-library/react';
import { useIsMutating } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';
import type { DomainPlace } from '@chatic/data';

import { useSiteSwitch } from '../../../runtime/useSiteSwitch';
import { useSwitchPlace } from './useSwitchPlace';

jest.mock('@tanstack/react-query', () => ({ useIsMutating: jest.fn() }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            // The key constants the hook reads — mocking the module makes the real exports disappear.
            SWITCH_SITE_MUTATION_KEY: ['session', 'switch-site'],
            SWITCH_CLOUD_MUTATION_KEY: ['session', 'switch-cloud'],
            useSessionSelection: jest.fn(),
        },
    },
}));
jest.mock('../../../runtime/useSiteSwitch', () => ({ useSiteSwitch: jest.fn() }));
jest.mock('@chatic/logger', () => ({ logger: { warn: jest.fn() } }));

const switchSiteMock = jest.fn();

const place = (id: string): DomainPlace => ({ id }) as unknown as DomainPlace;

const setSession = (selectedSiteId: string | null, isSwitching = false, selectedCloudId = 'default') => {
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedSiteId, selectedCloudId });
    (useSiteSwitch as jest.Mock).mockReturnValue({ switchSite: switchSiteMock, isSwitching });
};

/** Global in-flight switch count, as `useIsMutating` reports it for either key. */
const setSwitchesInFlight = (count: number) => {
    (useIsMutating as jest.Mock).mockReturnValue(count);
};

beforeEach(() => {
    jest.clearAllMocks();
    switchSiteMock.mockResolvedValue(undefined);
    setSwitchesInFlight(0);
});

describe('useSwitchPlace — 플레이스 전환', () => {
    it('활성 플레이스가 없으면 첫 플레이스를 자동 선택한다', () => {
        setSession(null);
        renderHook(() => useSwitchPlace([place('p1'), place('p2')], false));
        expect(switchSiteMock).toHaveBeenCalledWith('p1');
    });

    it('이미 선택된 플레이스가 있으면 자동 선택하지 않는다', () => {
        setSession('p2');
        renderHook(() => useSwitchPlace([place('p1'), place('p2')], false));
        expect(switchSiteMock).not.toHaveBeenCalled();
    });

    it('switchPlace는 현재 선택과 같은 id면 무시한다', () => {
        setSession('p1');
        const { result } = renderHook(() => useSwitchPlace([place('p1')], false));
        result.current.switchPlace('p1');
        expect(switchSiteMock).not.toHaveBeenCalled();
    });

    it('switchPlace는 전환 중이면 무시한다', () => {
        setSession('p1', true);
        const { result } = renderHook(() => useSwitchPlace([place('p1'), place('p2')], false));
        result.current.switchPlace('p2');
        expect(switchSiteMock).not.toHaveBeenCalled();
    });

    it('switchPlace는 다른 플레이스로 전환을 요청한다', () => {
        setSession('p1');
        const { result } = renderHook(() => useSwitchPlace([place('p1'), place('p2')], false));
        result.current.switchPlace('p2');
        expect(switchSiteMock).toHaveBeenCalledWith('p2');
    });
});

// A selection persists across launches (localStorage inside the native shell), so it can name a
// place the account no longer has — deleted or left while the app was closed. Its cached row
// survives until the next full list refresh prunes it; these lock the fallback that reacts to
// that prune, and the cases that must NOT read as one.
describe('useSwitchPlace — stale stored selection', () => {
    type Props = { places: DomainPlace[]; isPlacesLoading: boolean };
    const render = (props: Props) =>
        renderHook(({ places, isPlacesLoading }: Props) => useSwitchPlace(places, isPlacesLoading), {
            initialProps: props,
        });
    const withStale = { places: [place('p1'), place('stale')], isPlacesLoading: false };
    const pruned = { places: [place('p1')], isPlacesLoading: false };

    it('falls back to the first place once the selected place drops out of the loaded list', () => {
        setSession('stale', false, 'cloud-a');
        const { rerender } = render(withStale);
        expect(switchSiteMock).not.toHaveBeenCalled();
        rerender(pruned);
        expect(switchSiteMock).toHaveBeenCalledTimes(1);
        expect(switchSiteMock).toHaveBeenCalledWith('p1');
    });

    it('ignores a selection the list never carried (a switch into a place not cached yet)', () => {
        setSession('fresh', false, 'cloud-a');
        const { rerender } = render(pruned);
        rerender({ places: [place('p1'), place('p2')], isPlacesLoading: false });
        expect(switchSiteMock).not.toHaveBeenCalled();
    });

    it('keeps the selection while the list is still loading', () => {
        setSession('stale', false, 'cloud-a');
        const { rerender } = render(withStale);
        rerender({ places: [place('p1')], isPlacesLoading: true });
        expect(switchSiteMock).not.toHaveBeenCalled();
    });

    it('keeps the selection when the list is empty', () => {
        setSession('stale', false, 'cloud-a');
        const { rerender } = render(withStale);
        rerender({ places: [], isPlacesLoading: false });
        expect(switchSiteMock).not.toHaveBeenCalled();
    });

    it('does not fall back while a switch started elsewhere is in flight', () => {
        setSession('stale', false, 'cloud-a');
        const { rerender } = render(withStale);
        setSwitchesInFlight(1);
        rerender(pruned);
        expect(switchSiteMock).not.toHaveBeenCalled();
    });

    it('does not fall back on the relay', () => {
        setSession('stale', false, 'default');
        const { rerender } = render(withStale);
        rerender(pruned);
        expect(switchSiteMock).not.toHaveBeenCalled();
    });

    it('attempts the fallback once per stale selection, even after a rejected switch', () => {
        switchSiteMock.mockRejectedValue(new Error('server refused'));
        setSession('stale', false, 'cloud-a');
        const { rerender } = render(withStale);
        rerender(pruned);
        // A rejected switch rolls the selection back to the stale id; a fresh list reference
        // re-runs the effect exactly as a mutation settling would.
        rerender({ places: [place('p1')], isPlacesLoading: false });
        expect(switchSiteMock).toHaveBeenCalledTimes(1);
    });
});
