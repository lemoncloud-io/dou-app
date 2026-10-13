import { renderHook } from '@testing-library/react';

import { useOAuthHandler } from './useOAuthHandler';

const mockLogin = jest.fn();

jest.mock('../../hooks', () => ({
    useServices: () => ({
        oauthService: { login: (...args: unknown[]) => mockLogin(...args) },
        logService: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }),
}));

describe('useOAuthHandler login', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('answers a credential with success and the token result', async () => {
        const credential = { provider: 'google', idToken: 'id-1' };
        mockLogin.mockResolvedValue(credential);
        const { result } = renderHook(() => useOAuthHandler());

        const reply = await result.current.handleOAuthLogin({ data: { provider: 'google' } } as never);

        expect(reply).toEqual({ type: 'OnOAuthLogin', success: true, data: { result: credential } });
    });

    it('answers a user cancel with success and a null result', async () => {
        mockLogin.mockResolvedValue(null);
        const { result } = renderHook(() => useOAuthHandler());

        const reply = await result.current.handleOAuthLogin({ data: { provider: 'apple' } } as never);

        expect(reply).toEqual({ type: 'OnOAuthLogin', success: true, data: { result: null } });
    });

    it('answers a genuine failure with OAUTH_LOGIN_ERROR', async () => {
        mockLogin.mockRejectedValue(new Error('network down'));
        const { result } = renderHook(() => useOAuthHandler());

        const reply = await result.current.handleOAuthLogin({ data: { provider: 'google' } } as never);

        expect(reply).toEqual({
            type: 'OnOAuthLogin',
            success: false,
            error: { code: 'OAUTH_LOGIN_ERROR', message: 'network down' },
        });
    });
});
