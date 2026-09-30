import { renderHook } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { useSetMyPlaceProfile } from './useSetMyPlaceProfile';

const isMutatingMock = jest.fn();

jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ isMutating: isMutatingMock }) }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: jest.fn(),
        },
        session: {
            useSessionSelection: jest.fn(),
            SWITCH_SITE_MUTATION_KEY: ['session', 'switch-site'],
        },
    },
}));

const setMyProfileMock = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    isMutatingMock.mockReturnValue(0);
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({
        profile: { setMyProfile: setMyProfileMock },
    });
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedSiteId: 'active-site' });
});

describe('useSetMyPlaceProfile', () => {
    it('sid 없이 부르면 선택된 플레이스를 실어 저장한다', async () => {
        const { result } = renderHook(() => useSetMyPlaceProfile());

        await result.current({ nick: '레인', thumbnail: 'data:image/png;base64,x' });

        expect(setMyProfileMock).toHaveBeenCalledWith(
            { nick: '레인', thumbnail: 'data:image/png;base64,x' },
            'active-site'
        );
    });

    it('ignores a site id passed by a caller and still writes to the active place', async () => {
        const { result } = renderHook(() => useSetMyPlaceProfile());

        // The signature no longer takes one; a stale caller passing it must not steer the write.
        await (result.current as (value: { nick: string }, siteId: string) => Promise<void>)(
            { nick: 'Raine' },
            'other-site'
        );

        expect(setMyProfileMock).toHaveBeenCalledWith({ nick: 'Raine', thumbnail: undefined }, 'active-site');
    });

    it('refuses to write while a place switch is in flight', async () => {
        isMutatingMock.mockReturnValue(1);
        const { result } = renderHook(() => useSetMyPlaceProfile());

        await expect(result.current({ nick: 'Raine' })).rejects.toThrow(/switch is in flight/);

        expect(isMutatingMock).toHaveBeenCalledWith({ mutationKey: ['session', 'switch-site'] });
        expect(setMyProfileMock).not.toHaveBeenCalled();
    });

    it('refuses to write when no place is active', async () => {
        (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedSiteId: null });
        const { result } = renderHook(() => useSetMyPlaceProfile());

        await expect(result.current({ nick: 'Raine' })).rejects.toThrow(/no active place/);

        expect(setMyProfileMock).not.toHaveBeenCalled();
    });
});
