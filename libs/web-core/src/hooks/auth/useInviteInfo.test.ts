import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

const mockFetchInviteInfoWithCode = jest.fn();
const mockUseSessionAuth = jest.fn();
const mockGetDynamicRelayBackend = jest.fn();

jest.mock('../../api', () => ({
    fetchInviteInfoWithCode: (...args: unknown[]) => mockFetchInviteInfoWithCode(...args),
}));

jest.mock('../../transport', () => ({
    getDynamicRelayBackend: () => mockGetDynamicRelayBackend(),
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
        // Default to an unconfigured relay endpoint so the no-backend cases stay disabled; the relay
        // test opts in by returning an endpoint.
        mockGetDynamicRelayBackend.mockReturnValue('');
    });

    it('인증 상태에서 code와 backend가 모두 있으면 초대 정보를 조회한다', async () => {
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: true });

        const { result } = renderHook(() => useInviteInfo('invt:1:abc', 'https://api'), { wrapper: makeWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(mockFetchInviteInfoWithCode).toHaveBeenCalledWith('invt:1:abc', 'https://api');
        expect(result.current.data).toEqual({ inviter$: { name: '홍길동' } });
    });

    it('backend 인자가 없어도 릴레이 엔드포인트가 있으면 그것으로 조회한다 (릴레이 초대)', async () => {
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: true });
        mockGetDynamicRelayBackend.mockReturnValue('https://relay.example.com');

        const { result } = renderHook(() => useInviteInfo('invt:1:abc', undefined), { wrapper: makeWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(mockFetchInviteInfoWithCode).toHaveBeenCalledWith('invt:1:abc', 'https://relay.example.com');
    });

    it('명시적 backend는 릴레이 폴백보다 우선한다', async () => {
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: true });
        mockGetDynamicRelayBackend.mockReturnValue('https://relay.example.com');

        const { result } = renderHook(() => useInviteInfo('invt:1:abc', 'https://cloud.example.com'), {
            wrapper: makeWrapper(),
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(mockFetchInviteInfoWithCode).toHaveBeenCalledWith('invt:1:abc', 'https://cloud.example.com');
    });

    it('릴레이 엔드포인트가 있어도 미인증이면 조회하지 않는다', () => {
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: false });
        mockGetDynamicRelayBackend.mockReturnValue('https://relay.example.com');

        renderHook(() => useInviteInfo('invt:1:abc', undefined), { wrapper: makeWrapper() });

        expect(mockFetchInviteInfoWithCode).not.toHaveBeenCalled();
    });

    it('릴레이 엔드포인트가 있어도 code가 없으면 조회하지 않는다', () => {
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: true });
        mockGetDynamicRelayBackend.mockReturnValue('https://relay.example.com');

        renderHook(() => useInviteInfo(null, undefined), { wrapper: makeWrapper() });

        expect(mockFetchInviteInfoWithCode).not.toHaveBeenCalled();
    });

    it('미인증이면 조회하지 않는다 (disabled)', () => {
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: false });

        renderHook(() => useInviteInfo('invt:1:abc', 'https://api'), { wrapper: makeWrapper() });

        expect(mockFetchInviteInfoWithCode).not.toHaveBeenCalled();
    });

    it('code가 없거나, backend와 릴레이 엔드포인트가 모두 없으면 조회하지 않는다', () => {
        mockUseSessionAuth.mockReturnValue({ isAuthenticated: true });
        // getDynamicRelayBackend returns '' here (beforeEach default), so nothing resolves an endpoint.

        renderHook(() => useInviteInfo(null, undefined), { wrapper: makeWrapper() });
        renderHook(() => useInviteInfo('invt:1:abc', undefined), { wrapper: makeWrapper() });

        expect(mockFetchInviteInfoWithCode).not.toHaveBeenCalled();
    });
});
