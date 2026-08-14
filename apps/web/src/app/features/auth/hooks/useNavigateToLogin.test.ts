import { renderHook } from '@testing-library/react';

import { useNavigateToLogin } from './useNavigateToLogin';

const navigate = jest.fn();
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));

let currentLocation = { pathname: '/mypage', search: '' };
jest.mock('react-router-dom', () => ({ useLocation: () => currentLocation }));

beforeEach(() => {
    jest.clearAllMocks();
    currentLocation = { pathname: '/mypage', search: '' };
});

describe('useNavigateToLogin', () => {
    it('현재 경로를 returnTo로 실어 로그인 화면으로 보낸다', () => {
        const { result } = renderHook(() => useNavigateToLogin());
        result.current();

        expect(navigate).toHaveBeenCalledWith('/mypage/login', { state: { returnTo: '/mypage' } });
    });

    // 쿼리로 상태를 나르는 화면(구독 플랜 등)은 경로만 복원하면 절반만 돌아온다.
    it('쿼리스트링까지 보존한다', () => {
        currentLocation = { pathname: '/subscription/plans', search: '?plan=pro&from=banner' };
        const { result } = renderHook(() => useNavigateToLogin());
        result.current();

        expect(navigate).toHaveBeenCalledWith('/mypage/login', {
            state: { returnTo: '/subscription/plans?plan=pro&from=banner' },
        });
    });

    // 로그인 화면이 스택에 쌓여야 복귀 시 replace가 그 항목을 덮어쓸 수 있다. 여기서 replace를
    // 쓰면 로그인을 부른 화면이 사라져 뒤로가기가 한 칸 더 멀리 간다.
    it('진입은 replace가 아니다', () => {
        const { result } = renderHook(() => useNavigateToLogin());
        result.current();

        expect(navigate.mock.calls[0][1]).not.toHaveProperty('replace');
    });
});
