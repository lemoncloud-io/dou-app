import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useCustomMutation } from '@chatic/shared';

import type { DomainCloud } from '@chatic/data';

/**
 * Releases one cloud. Moved down from `@chatic/app-runtime`'s `data/hooks/subscription.ts` to sit
 * with its only caller in this app (`CloudManagePage`).
 *
 * `cascade` is a named repository option now instead of a raw `params: { cascade: 1 }` bag — it
 * drops the cloud's dependent records along with the cloud row, and the wire encoding stays in
 * `data`.
 */
export const useDeleteCloud = () => {
    const { cloud } = useRuntimeRepositories();

    return useCustomMutation<DomainCloud, string, { id: string; cascade?: boolean }>(({ id, cascade }) =>
        cloud.releaseCloud(id, { cascade })
    );
};
