import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DataRepositoriesV2 } from '@chatic/data';

/**
 * Renames a cloud through repos.cloud.updateCloud (optimistic cache write → remote → rollback).
 * The cloud cache re-emits to observeItem/observeList subscribers on write, so the new name shows
 * reactively without a sync plan (clouds are mutated locally, not pushed over the socket).
 */
export const useUpdateCloud = () => {
    const repos = useRuntimeRepositories() as unknown as DataRepositoriesV2;

    return (id: string, name: string) =>
        repos.cloud.updateCloud({ id, name } as Parameters<typeof repos.cloud.updateCloud>[0]);
};
