import { useCallback, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';
import type { DomainCloud, DomainListResult } from '@chatic/data';

/**
 * Rename an owned cloud. `CloudRepository.updateCloud` already rewrites the cached cloud row
 * (optimistically, rolled back on failure), which refreshes everything reading the cache. The
 * rail's owned tiles read the relay catalog instead, and that react-query read is never written
 * by the repository, so the new name is patched into it here — a refetch right after the write
 * could still return the old name while the broker list catches up.
 */
export const useRenameCloud = () => {
    const { cloud: cloudRepository } = runtime.data.useRuntimeRepositories();
    const queryClient = useQueryClient();
    const [isRenaming, setIsRenaming] = useState(false);

    const renameCloud = useCallback(
        async (cloudId: string, name: string) => {
            setIsRenaming(true);
            try {
                const updated = await cloudRepository.updateCloud({ id: cloudId, name } as Parameters<
                    typeof cloudRepository.updateCloud
                >[0]);
                // Show what the server stored, falling back to what was sent.
                const stored = updated?.name || name;
                queryClient.setQueriesData<DomainListResult<DomainCloud>>(
                    { queryKey: runtime.data.cloudsKeys.lists() },
                    previous =>
                        previous?.list
                            ? {
                                  ...previous,
                                  list: previous.list.map(c => (c.id === cloudId ? { ...c, name: stored } : c)),
                              }
                            : previous
                );
            } finally {
                setIsRenaming(false);
            }
        },
        [cloudRepository, queryClient]
    );

    return { renameCloud, isRenaming };
};
