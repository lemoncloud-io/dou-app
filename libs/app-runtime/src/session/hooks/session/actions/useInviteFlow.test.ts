import { createElement } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { coreEngine } from '@chatic/runtime-core/engine';
import { fakeSessionCommands } from '@chatic/runtime-core/testing/sessionCommands';

import { initAppRuntime, resetRuntimeEngine } from '../../../../init';

const mockUseSessionIdentity = jest.fn();
jest.mock('../readers/useSessionIdentity', () => ({
    useSessionIdentity: () => mockUseSessionIdentity(),
}));

const { useInviteFlow } = require('./useInviteFlow');

const loginWithInviteCode = jest.fn();
const createWrapper = () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return ({ children }: { children: React.ReactNode }) => createElement(QueryClientProvider, { client }, children);
};

describe('useInviteFlow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        loginWithInviteCode.mockResolvedValue({ handle: 'invite-login-1', cloudId: 'cloud-1' });
        initAppRuntime({ ...coreEngine, commands: fakeSessionCommands({ loginWithInviteCode }) });
    });

    afterEach(() => resetRuntimeEngine());

    it("logs in with the invite code through the engine and answers with the runtime's handle", async () => {
        mockUseSessionIdentity.mockReturnValue({ delegatorId: 'delegator-1' });

        const { result } = renderHook(() => useInviteFlow(), { wrapper: createWrapper() });

        const login = await result.current.runInviteFlow({
            code: 'INVITE',
            backend: 'https://cloud.example.com',
        });

        expect(loginWithInviteCode).toHaveBeenCalledWith('INVITE', 'delegator-1', 'https://cloud.example.com');
        expect(login).toEqual({ handle: 'invite-login-1', cloudId: 'cloud-1' });
    });

    it('throws when no delegatorId is available', async () => {
        mockUseSessionIdentity.mockReturnValue({ delegatorId: null });

        const { result } = renderHook(() => useInviteFlow(), { wrapper: createWrapper() });

        await expect(result.current.runInviteFlow({ code: 'INVITE' })).rejects.toThrow('No delegatorId');
        expect(loginWithInviteCode).not.toHaveBeenCalled();
    });
});
