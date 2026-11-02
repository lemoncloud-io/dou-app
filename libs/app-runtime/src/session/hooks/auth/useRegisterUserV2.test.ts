import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

const mockRegisterUserV2 = jest.fn();

jest.mock('@chatic/auth', () => ({
    registerUserV2: (...args: unknown[]) => mockRegisterUserV2(...args),
}));

const { useRegisterUserV2 } = require('./useRegisterUserV2');

const makeWrapper = () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
};

describe('useRegisterUserV2', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRegisterUserV2.mockResolvedValue({ id: 'u1' });
    });

    it('registers on the session relay when no endpoint is given', async () => {
        const { result } = renderHook(() => useRegisterUserV2(), { wrapper: makeWrapper() });

        await act(() => result.current.mutateAsync({ stereo: 'user', name: 'A', email: true }));

        expect(mockRegisterUserV2).toHaveBeenCalledWith({ stereo: 'user', name: 'A' }, true, undefined);
    });

    it('passes an endpoint as the override, and keeps it out of the body', async () => {
        const { result } = renderHook(() => useRegisterUserV2(), { wrapper: makeWrapper() });

        await act(() =>
            result.current.mutateAsync({ stereo: 'user', name: 'A', endpoint: 'https://other.example.com/dou-d1' })
        );

        expect(mockRegisterUserV2).toHaveBeenCalledWith({ stereo: 'user', name: 'A' }, undefined, {
            endpoint: 'https://other.example.com/dou-d1',
        });
    });
});
