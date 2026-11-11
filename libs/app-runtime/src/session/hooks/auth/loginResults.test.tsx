import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';

import { useLogin } from './useLogin';
import { useLoginRelayGuestByDevice } from './useLoginRelayGuestByDevice';
import { useLoginRelaySocial } from './useLoginRelaySocial';

// What every login answers with — a token view, as the backend sends it. The hooks hand the screen
// the account's fields only: the token stays with the session.
const answer = { uid: 'u1', name: 'Me', createdAt: 1, Token: { identityToken: 'secret-identity' } };

jest.mock('@chatic/auth/session/relaySession', () => ({
    relaySession: {
        loginUser: jest.fn(async () => answer),
        loginBySocialToken: jest.fn(async () => answer),
        loginGuestByDevice: jest.fn(async () => answer),
    },
}));

const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) },
        children
    );

describe('the login hooks', () => {
    const account = { uid: 'u1', name: 'Me', createdAt: 1 };

    it('answer an email login with the account, without its token', async () => {
        const { result } = renderHook(() => useLogin(), { wrapper });

        await expect(result.current.mutateAsync({ uid: 'me@example.com', pwd: 'pw' })).resolves.toEqual(account);
    });

    it('answer a social login with the account, without its token', async () => {
        const { result } = renderHook(() => useLoginRelaySocial(), { wrapper });

        await expect(result.current.mutateAsync({ body: {} as never, provider: 'google' })).resolves.toEqual(account);
    });

    it('answer a guest login with the account, without its token', async () => {
        const { result } = renderHook(() => useLoginRelayGuestByDevice(), { wrapper });

        await expect(result.current.mutateAsync('device-1')).resolves.toEqual(account);
    });
});
