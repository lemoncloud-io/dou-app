import { renderHook } from '@testing-library/react';

import { useNavigateToLogin } from './useNavigateToLogin';

const navigate = jest.fn();
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));

let currentLocation = { pathname: '/mypage', search: '', hash: '' };
jest.mock('react-router-dom', () => ({ useLocation: () => currentLocation }));

beforeEach(() => {
    jest.clearAllMocks();
    currentLocation = { pathname: '/mypage', search: '', hash: '' };
});

describe('useNavigateToLogin', () => {
    it('현재 경로를 returnTo로 실어 로그인 화면으로 보낸다', () => {
        const { result } = renderHook(() => useNavigateToLogin());
        result.current();

        expect(navigate).toHaveBeenCalledWith('/mypage/login', { state: { returnTo: '/mypage' } });
    });

    // A screen that carries state in its query (like the subscription plan screen) only comes back halfway if just the path is restored.
    it('쿼리스트링까지 보존한다', () => {
        currentLocation = { pathname: '/subscription/plans', search: '?plan=pro&from=banner', hash: '' };
        const { result } = renderHook(() => useNavigateToLogin());
        result.current();

        expect(navigate).toHaveBeenCalledWith('/mypage/login', {
            state: { returnTo: '/subscription/plans?plan=pro&from=banner' },
        });
    });

    // The login screen has to actually push onto the stack so that a later replace on return can
    // overwrite that entry. Using replace here would make the screen that invoked login disappear,
    // pushing the back button one step further away.
    it('진입은 replace가 아니다', () => {
        const { result } = renderHook(() => useNavigateToLogin());
        result.current();

        expect(navigate.mock.calls[0][1]).not.toHaveProperty('replace');
    });
});

describe('useNavigateToLogin — returnTo를 남기지 않는 경우', () => {
    // On the day an entry point ends up rendering on top of the login screen, if returnTo points at
    // the login screen itself, logging in would just bounce back to the login screen.
    it('이미 로그인 화면이면 returnTo를 싣지 않는다', () => {
        currentLocation = { pathname: '/mypage/login', search: '', hash: '' };
        const { result } = renderHook(() => useNavigateToLogin());
        result.current();

        expect(navigate).toHaveBeenCalledWith('/mypage/login', { state: { returnTo: undefined } });
    });

    it('해시도 보존한다', () => {
        currentLocation = { pathname: '/mypage', search: '', hash: '#section' };
        const { result } = renderHook(() => useNavigateToLogin());
        result.current();

        expect(navigate).toHaveBeenCalledWith('/mypage/login', { state: { returnTo: '/mypage#section' } });
    });
});
