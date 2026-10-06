import { describe, expect, it, vi } from 'vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

const updateCloud = vi.fn();
const listKey = ['clouds', 'list', { filters: { limit: -1 } }];

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({ cloud: { updateCloud } }),
            cloudsKeys: { lists: () => ['clouds', 'list'] },
        },
    },
}));

import { useRenameCloud } from './useRenameCloud';

type Catalog = { list: Array<{ id: string; name: string }> };

const setup = () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(listKey, {
        list: [
            { id: 'a', name: 'Old' },
            { id: 'b', name: 'Other' },
        ],
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return { queryClient, ...renderHook(() => useRenameCloud(), { wrapper }) };
};

describe('useRenameCloud', () => {
    it('updates through the repository and patches the catalog name', async () => {
        updateCloud.mockResolvedValue({ id: 'a', name: 'New' });
        const { result, queryClient } = setup();

        await act(() => result.current.renameCloud('a', 'New'));

        expect(updateCloud).toHaveBeenCalledWith({ id: 'a', name: 'New' });
        expect(queryClient.getQueryData<Catalog>(listKey)?.list.map(c => c.name)).toEqual(['New', 'Other']);
        expect(result.current.isRenaming).toBe(false);
    });

    it('leaves the catalog alone when the update fails', async () => {
        updateCloud.mockRejectedValue(new Error('boom'));
        const { result, queryClient } = setup();

        await expect(act(() => result.current.renameCloud('a', 'New'))).rejects.toThrow('boom');

        expect(queryClient.getQueryData<Catalog>(listKey)?.list[0].name).toBe('Old');
        expect(result.current.isRenaming).toBe(false);
    });
});
