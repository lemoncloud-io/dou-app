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

    it('쿼리스트링까지 보존한다', () => {
        currentLocation = { pathname: '/subscription/plans', search: '?plan=pro&from=banner', hash: '' };
        const { result } = renderHook(() => useNavigateToLogin());
        result.current();

        expect(navigate).toHaveBeenCalledWith('/mypage/login', {
            state: { returnTo: '/subscription/plans?plan=pro&from=banner' },
        });
    });

    it('진입은 replace가 아니다', () => {
        const { result } = renderHook(() => useNavigateToLogin());
        result.current();

        expect(navigate.mock.calls[0][1]).not.toHaveProperty('replace');
    });
});

describe('useNavigateToLogin — returnTo를 남기지 않는 경우', () => {
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
