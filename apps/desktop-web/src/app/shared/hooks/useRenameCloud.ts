import { useCallback, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime-react';
import type { DomainCloud, DomainListResult } from '@chatic/runtime-react';

export const CLOUD_NAME_MAX = 20;

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
