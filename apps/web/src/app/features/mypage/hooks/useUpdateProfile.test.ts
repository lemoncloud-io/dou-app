import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import { runtime } from '@chatic/runtime-react';

import { useUpdateProfile } from './useUpdateProfile';

jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        session: {
            patchRelaySessionUser: jest.fn(),
            updateAccountProfile: (...args: unknown[]) => updateMock(...args),
        },
    })
);

const updateMock = jest.fn();
const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: new QueryClient() }, children);

beforeEach(() => {
    jest.clearAllMocks();
});

describe('useUpdateProfile', () => {
    it("writes through the runtime's relay account update, not the active slot", async () => {
        updateMock.mockResolvedValue({ id: 'me', name: 'Neo', photo: 'server.png' });

        const { result } = renderHook(() => useUpdateProfile(), { wrapper });
        const returned = await result.current.mutateAsync({ name: 'Neo', photo: 'p' });

        expect(updateMock).toHaveBeenCalledWith({ name: 'Neo', photo: 'p' });
        expect(returned).toEqual({ name: 'Neo', photo: 'p' });
    });

    it("applies the server's echo to the relay token", async () => {
        updateMock.mockResolvedValue({ name: 'Neo', photo: 'server.png' });

        const { result } = renderHook(() => useUpdateProfile(), { wrapper });
        await result.current.mutateAsync({ name: 'Neo', photo: 'p' });

        expect(runtime.session.patchRelaySessionUser).toHaveBeenCalledWith({ name: 'Neo', photo: 'server.png' });
    });

    it('falls back to what was sent when the response comes back thin', async () => {
        updateMock.mockResolvedValue(undefined);

        const { result } = renderHook(() => useUpdateProfile(), { wrapper });
        await result.current.mutateAsync({ name: 'Neo', photo: 'p' });

        expect(runtime.session.patchRelaySessionUser).toHaveBeenCalledWith({ name: 'Neo', photo: 'p' });
    });

    it('does not touch the photo when the caller did not send one', async () => {
        updateMock.mockResolvedValue({ name: 'Neo' });

        const { result } = renderHook(() => useUpdateProfile(), { wrapper });
        await result.current.mutateAsync({ name: 'Neo' });

        expect(runtime.session.patchRelaySessionUser).toHaveBeenCalledWith({ name: 'Neo' });
    });

    it('propagates the error when the remote update fails', async () => {
        updateMock.mockRejectedValue(new Error('boom'));

        const { result } = renderHook(() => useUpdateProfile(), { wrapper });
        await expect(result.current.mutateAsync({ name: 'Neo' })).rejects.toThrow('boom');
        expect(runtime.session.patchRelaySessionUser).not.toHaveBeenCalled();
    });
});
