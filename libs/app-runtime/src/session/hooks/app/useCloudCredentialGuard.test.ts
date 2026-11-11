import { renderHook } from '@testing-library/react';

import { useCloudCredentialGuard } from './useCloudCredentialGuard';

const mockStop = jest.fn();
const mockStart = jest.fn(() => mockStop);
const mockCheck = jest.fn(() => Promise.resolve());
const mockSetPolicy = jest.fn();
const mockConstruct = jest.fn();
jest.mock('@chatic/runtime-core/session/cloudCredentialGuard', () => ({
    CloudCredentialGuard: jest.fn().mockImplementation((policy: unknown) => {
        mockConstruct(policy);
        return { start: mockStart, check: mockCheck, setPolicy: mockSetPolicy };
    }),
}));

beforeEach(() => jest.clearAllMocks());

describe('useCloudCredentialGuard', () => {
    it('starts one guard on mount and stops it on unmount', () => {
        const { unmount } = renderHook(() => useCloudCredentialGuard());

        expect(mockConstruct).toHaveBeenCalledTimes(1);
        expect(mockStart).toHaveBeenCalledTimes(1);

        unmount();
        expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it('restarts the guard when the margin changes, keeping the same guard', () => {
        const { rerender } = renderHook(({ marginMs }) => useCloudCredentialGuard({ marginMs }), {
            initialProps: { marginMs: 10_000 },
        });

        rerender({ marginMs: 20_000 });

        expect(mockConstruct).toHaveBeenCalledTimes(1);
        expect(mockStart).toHaveBeenCalledTimes(2);
        expect(mockSetPolicy).toHaveBeenLastCalledWith({ marginMs: 20_000 });
    });

    it('hands back a stable check that runs the guard', async () => {
        const { result, rerender } = renderHook(() => useCloudCredentialGuard());
        const first = result.current.check;

        rerender();
        await result.current.check();

        expect(result.current.check).toBe(first);
        expect(mockCheck).toHaveBeenCalledTimes(1);
    });

    it('hands the guard its policy before it starts it', () => {
        renderHook(() => useCloudCredentialGuard({}));

        expect(mockSetPolicy.mock.invocationCallOrder[0]).toBeLessThan(mockStart.mock.invocationCallOrder[0]);
    });
});
