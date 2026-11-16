import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';

import type { SessionAccountView } from '@chatic/auth';
import { coreEngine } from '@chatic/runtime-core/engine';
import { fakeSessionCommands } from '@chatic/runtime-core/testing/sessionCommands';

import { initAppRuntime, resetRuntimeEngine } from '../../../init';
import { useLogin } from './useLogin';
import { useLoginRelayGuestByDevice } from './useLoginRelayGuestByDevice';
import { useLoginRelaySocial } from './useLoginRelaySocial';

// What every login command answers with — the account, without its token (the engine strips it).
const account = { uid: 'u1', name: 'Me', createdAt: 1 } as unknown as SessionAccountView;
const loginUser = jest.fn(async () => account);
const loginBySocialToken = jest.fn(async () => account);
const loginGuestByDevice = jest.fn(async () => account);

const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) },
        children
    );

beforeEach(() => {
    jest.clearAllMocks();
    initAppRuntime({
        ...coreEngine,
        commands: fakeSessionCommands({ loginUser, loginBySocialToken, loginGuestByDevice }),
    });
});

afterEach(() => resetRuntimeEngine());

describe('the login hooks', () => {
    it("run an email login through the engine's command and answer with the account", async () => {
        const { result } = renderHook(() => useLogin(), { wrapper });

        await expect(result.current.mutateAsync({ uid: 'me@example.com', pwd: 'pw', email: true })).resolves.toEqual(
            account
        );
        expect(loginUser).toHaveBeenCalledWith({ uid: 'me@example.com', pwd: 'pw' }, { email: true });
    });

    it("run a social login through the engine's command and answer with the account", async () => {
        const { result } = renderHook(() => useLoginRelaySocial(), { wrapper });

        await expect(result.current.mutateAsync({ body: {} as never, provider: 'google' })).resolves.toEqual(account);
        expect(loginBySocialToken).toHaveBeenCalledWith({}, 'google');
    });

    it("run a guest login through the engine's command and answer with the account", async () => {
        const { result } = renderHook(() => useLoginRelayGuestByDevice(), { wrapper });

        await expect(result.current.mutateAsync('device-1')).resolves.toEqual(account);
        expect(loginGuestByDevice).toHaveBeenCalledWith('device-1');
    });
});
