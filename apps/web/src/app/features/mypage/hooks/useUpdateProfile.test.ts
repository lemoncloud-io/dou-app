import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import { patchRelaySessionUser } from '@chatic/web-core';

import { getRelayAccountGateway } from '../../../runtime/relayAccountGateway';
import { useUpdateProfile } from './useUpdateProfile';

jest.mock('@chatic/web-core', () => ({ patchRelaySessionUser: jest.fn() }));
jest.mock('../../../runtime/relayAccountGateway', () => ({ getRelayAccountGateway: jest.fn() }));

const updateMock = jest.fn();
const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: new QueryClient() }, children);

beforeEach(() => {
    jest.clearAllMocks();
    (getRelayAccountGateway as jest.Mock).mockReturnValue({ update: updateMock });
});

describe('useUpdateProfile', () => {
    it('writes through the RELAY-pinned user gateway, not the active slot', async () => {
        updateMock.mockResolvedValue({ id: 'me', name: 'Neo', photo: 'server.png' });

        const { result } = renderHook(() => useUpdateProfile(), { wrapper });
        const returned = await result.current.mutateAsync({ name: 'Neo', photo: 'p' });

        expect(getRelayAccountGateway).toHaveBeenCalled();
        expect(updateMock).toHaveBeenCalledWith({ name: 'Neo', photo: 'p' });
        expect(returned).toEqual({ name: 'Neo', photo: 'p' });
    });

    // Patching the relay token is the only fan-out: every account reader re-reads it on the session
    // signal, and there is deliberately no cache write (the cache is partitioned by the active cloud).
    it("applies the server's echo to the relay token", async () => {
        updateMock.mockResolvedValue({ name: 'Neo', photo: 'server.png' });

        const { result } = renderHook(() => useUpdateProfile(), { wrapper });
        await result.current.mutateAsync({ name: 'Neo', photo: 'p' });

        expect(patchRelaySessionUser).toHaveBeenCalledWith({ name: 'Neo', photo: 'server.png' });
    });

    it('falls back to what was sent when the response comes back thin', async () => {
        updateMock.mockResolvedValue(undefined);

        const { result } = renderHook(() => useUpdateProfile(), { wrapper });
        await result.current.mutateAsync({ name: 'Neo', photo: 'p' });

        expect(patchRelaySessionUser).toHaveBeenCalledWith({ name: 'Neo', photo: 'p' });
    });

    // The caller omits `photo` when it did not change, and an absent field must mean "leave it alone"
    // rather than "clear it".
    it('does not touch the photo when the caller did not send one', async () => {
        updateMock.mockResolvedValue({ name: 'Neo' });

        const { result } = renderHook(() => useUpdateProfile(), { wrapper });
        await result.current.mutateAsync({ name: 'Neo' });

        expect(patchRelaySessionUser).toHaveBeenCalledWith({ name: 'Neo' });
    });

    it('propagates the error when the remote update fails', async () => {
        updateMock.mockRejectedValue(new Error('boom'));

        const { result } = renderHook(() => useUpdateProfile(), { wrapper });
        await expect(result.current.mutateAsync({ name: 'Neo' })).rejects.toThrow('boom');
        expect(patchRelaySessionUser).not.toHaveBeenCalled();
    });
});
