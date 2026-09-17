import { renderHook } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { useSetMyPlaceProfile } from './useSetMyPlaceProfile';

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

const setMyProfileMock = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({
        profile: { setMyProfile: setMyProfileMock },
    });
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedSiteId: 'active-site' });
});

describe('useSetMyPlaceProfile', () => {
    // The two write paths were folded into one: the site is an argument, never read off the
    // ambient data context. These cases pin that there is exactly one call shape.
    it('sid 없이 부르면 선택된 플레이스를 실어 저장한다', async () => {
        const { result } = renderHook(() => useSetMyPlaceProfile());

        await result.current({ nick: '레인', thumbnail: 'data:image/png;base64,x' });

        expect(setMyProfileMock).toHaveBeenCalledWith(
            { nick: '레인', thumbnail: 'data:image/png;base64,x' },
            'active-site'
        );
    });

    it('siteId를 주면 그 값이 선택된 플레이스를 이긴다 — 전환 중 이전 스코프로 새지 않도록', async () => {
        const { result } = renderHook(() => useSetMyPlaceProfile());

        await result.current({ nick: '레인' }, 'site-1');

        expect(setMyProfileMock).toHaveBeenCalledWith({ nick: '레인', thumbnail: undefined }, 'site-1');
    });

    it('선택된 플레이스가 없으면 빈 문자열로 저장한다', async () => {
        (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedSiteId: null });
        const { result } = renderHook(() => useSetMyPlaceProfile());

        await result.current({ nick: '레인' });

        expect(setMyProfileMock).toHaveBeenCalledWith({ nick: '레인', thumbnail: undefined }, '');
    });
});
