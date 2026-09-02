import { createElement } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRegisterUserWithInviteCode = jest.fn();
const mockUseSessionIdentity = jest.fn();

jest.mock('../../../auth/authActions', () => ({
    registerUserWithInviteCode: (...args: unknown[]) => mockRegisterUserWithInviteCode(...args),
}));

jest.mock('../readers/useSessionIdentity', () => ({
    useSessionIdentity: () => mockUseSessionIdentity(),
}));

const { useInviteFlow } = require('./useInviteFlow');

const createWrapper = () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return ({ children }: { children: React.ReactNode }) => createElement(QueryClientProvider, { client }, children);
};

describe('useInviteFlow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRegisterUserWithInviteCode.mockResolvedValue({
            Token: {},
            cloudId: 'cloud-1',
            siteId: 'site-1',
            name: 'My Cloud',
        });
    });

    it('logs in with the invite code and returns the token view', async () => {
        mockUseSessionIdentity.mockReturnValue({ delegatorId: 'delegator-1' });

        const { result } = renderHook(() => useInviteFlow(), { wrapper: createWrapper() });

        const token = await result.current.runInviteFlow({
            code: 'INVITE',
            backend: 'https://cloud.example.com',
        });

        expect(mockRegisterUserWithInviteCode).toHaveBeenCalledWith(
            'INVITE',
            'delegator-1',
            'https://cloud.example.com'
        );
        expect(token).toEqual({ Token: {}, cloudId: 'cloud-1', siteId: 'site-1', name: 'My Cloud' });
    });

    it('throws when no delegatorId is available', async () => {
        mockUseSessionIdentity.mockReturnValue({ delegatorId: null });

        const { result } = renderHook(() => useInviteFlow(), { wrapper: createWrapper() });

        await expect(result.current.runInviteFlow({ code: 'INVITE' })).rejects.toThrow('No delegatorId');
        expect(mockRegisterUserWithInviteCode).not.toHaveBeenCalled();
    });
});
