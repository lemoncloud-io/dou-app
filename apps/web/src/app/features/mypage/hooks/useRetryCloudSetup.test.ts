import { act, renderHook } from '@testing-library/react';

import { useRetryCloudSetup } from './useRetryCloudSetup';

const retryCloudSetup = jest.fn();
const invalidateQueries = jest.fn();

jest.mock('@tanstack/react-query', () => ({
    ...jest.requireActual('@tanstack/react-query'),
    useQueryClient: () => ({ invalidateQueries }),
}));
jest.mock('@chatic/shared', () => ({
    useCustomMutation: (mutationFn: (v: unknown) => Promise<unknown>) => ({ mutateAsync: mutationFn }),
}));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({ cloud: { retryCloudSetup } }),
            cloudsKeys: { lists: () => ['clouds', 'list'] },
        },
    },
}));

beforeEach(() => jest.clearAllMocks());

describe('useRetryCloudSetup', () => {
    it('retries that cloud and re-reads the catalog before resolving', async () => {
        const order: string[] = [];
        retryCloudSetup.mockImplementation(async () => {
            order.push('retry');
            return { id: 'CL1' };
        });
        invalidateQueries.mockImplementation(async () => {
            order.push('reread');
        });
        const { result } = renderHook(() => useRetryCloudSetup());

        await act(async () => {
            await expect(result.current.mutateAsync({ id: 'CL1' })).resolves.toEqual({ id: 'CL1' });
        });

        expect(retryCloudSetup).toHaveBeenCalledWith('CL1');
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['clouds', 'list'] });
        expect(order).toEqual(['retry', 'reread']);
    });

    it('leaves the catalog alone when the relay refuses', async () => {
        retryCloudSetup.mockRejectedValue(new Error('403 FORBIDDEN'));
        const { result } = renderHook(() => useRetryCloudSetup());

        await act(async () => {
            await expect(result.current.mutateAsync({ id: 'CL1' })).rejects.toThrow('403');
        });

        expect(invalidateQueries).not.toHaveBeenCalled();
    });
});
