import { renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useSetMyPlaceProfile } from './useSetMyPlaceProfile';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));

const setMyProfileMock = jest.fn();
const setProfileMock = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
        profile: { setMyProfile: setMyProfileMock, setProfile: setProfileMock },
    });
});

describe('useSetMyPlaceProfile', () => {
    it('sid 없이 부르면 활성 컨텍스트에 저장한다 (setMyProfile)', async () => {
        const { result } = renderHook(() => useSetMyPlaceProfile());

        await result.current({ nick: '레인', thumbnail: 'data:image/png;base64,x' });

        expect(setMyProfileMock).toHaveBeenCalledWith({ nick: '레인', thumbnail: 'data:image/png;base64,x' });
        expect(setProfileMock).not.toHaveBeenCalled();
    });

    it('siteId를 주면 그 플레이스에 고정해서 저장한다 — 전환 중 이전 스코프로 새지 않도록', async () => {
        const { result } = renderHook(() => useSetMyPlaceProfile());

        await result.current({ nick: '레인' }, 'site-1');

        expect(setProfileMock).toHaveBeenCalledWith({
            nick: '레인',
            thumbnail: undefined,
            siteId: 'site-1',
            active: true,
        });
        expect(setMyProfileMock).not.toHaveBeenCalled();
    });
});
