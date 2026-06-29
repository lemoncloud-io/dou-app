import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

const mockFetchInviteInfoWithCode = jest.fn();
const mockUseSessionAuth = jest.fn();

jest.mock('../../api', () => ({
    fetchInviteInfoWithCode: (...args: unknown[]) => mockFetchInviteInfoWithCode(...args),
}));

jest.mock('../session', () => ({
    useSessionAuth: () => mockUseSessionAuth(),
}));

const { useInviteInfo } = require('./useInviteInfo');

// Each test gets a fresh client with retries off so a disabled/failed query settles deterministically.
const makeWrapper = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
};

describe('useInviteInfo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetchInviteInfoWithCode.mockResolvedValue({ inviter$: { name: '홍길동' } });
    });

    it('인증 상태에서 code와 backend가 모두 있으면 초대 정보를 조회한다', async () => {
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: true });

        const { result } = renderHook(() => useInviteInfo('invt:1:abc', 'https://api'), { wrapper: makeWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(mockFetchInviteInfoWithCode).toHaveBeenCalledWith('invt:1:abc', 'https://api');
        expect(result.current.data).toEqual({ inviter$: { name: '홍길동' } });
    });

    it('미인증이면 조회하지 않는다 (disabled)', () => {
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: false });

        renderHook(() => useInviteInfo('invt:1:abc', 'https://api'), { wrapper: makeWrapper() });

        expect(mockFetchInviteInfoWithCode).not.toHaveBeenCalled();
    });

    it('code 또는 backend가 없으면 조회하지 않는다', () => {
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: true });

        renderHook(() => useInviteInfo(null, undefined), { wrapper: makeWrapper() });
        renderHook(() => useInviteInfo('invt:1:abc', undefined), { wrapper: makeWrapper() });

        expect(mockFetchInviteInfoWithCode).not.toHaveBeenCalled();
    });
});
