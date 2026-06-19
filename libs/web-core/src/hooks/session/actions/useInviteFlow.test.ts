import { createElement } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockLoginWithInviteCode = jest.fn();
const mockSwitchCloudSession = jest.fn();
const mockUseSessionIdentity = jest.fn();

jest.mock('../../../session', () => ({
    loginWithInviteCode: (...args: unknown[]) => mockLoginWithInviteCode(...args),
    switchCloudSession: (...args: unknown[]) => mockSwitchCloudSession(...args),
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
        mockLoginWithInviteCode.mockResolvedValue({ Token: {} });
        mockSwitchCloudSession.mockResolvedValue({ cloudId: 'cloud-1' });
    });

    it('logs in with the invite code then enters the cloud via switchCloudSession', async () => {
        mockUseSessionIdentity.mockReturnValue({ delegatorId: 'delegator-1' });

        const { result } = renderHook(() => useInviteFlow(), { wrapper: createWrapper() });

        await result.current.runInviteFlow({
            code: 'INVITE',
            backend: 'https://cloud.example.com',
            cloudId: 'cloud-1',
        });

        expect(mockLoginWithInviteCode).toHaveBeenCalledWith({
            code: 'INVITE',
            delegatorId: 'delegator-1',
            backend: 'https://cloud.example.com',
        });
        expect(mockSwitchCloudSession).toHaveBeenCalledWith({ cloudId: 'cloud-1' });
    });

    it('throws when no delegatorId is available', async () => {
        mockUseSessionIdentity.mockReturnValue({ delegatorId: null });

        const { result } = renderHook(() => useInviteFlow(), { wrapper: createWrapper() });

        await expect(result.current.runInviteFlow({ code: 'INVITE' })).rejects.toThrow('No delegatorId');
        expect(mockLoginWithInviteCode).not.toHaveBeenCalled();
    });

    it('only logs in when no cloudId is provided', async () => {
        mockUseSessionIdentity.mockReturnValue({ delegatorId: 'delegator-1' });

        const { result } = renderHook(() => useInviteFlow(), { wrapper: createWrapper() });

        await result.current.runInviteFlow({ code: 'INVITE' });

        expect(mockLoginWithInviteCode).toHaveBeenCalledTimes(1);
        expect(mockSwitchCloudSession).not.toHaveBeenCalled();
    });
});
