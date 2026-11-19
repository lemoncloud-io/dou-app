import { runtime, type DomainCloud } from '@chatic/runtime';
import { useCustomMutation } from '@chatic/shared';

/**
 * Releases one cloud. Moved down from `@chatic/runtime`'s `data/hooks/subscription.ts` to sit
 * with its only caller in this app (`CloudDetailPage`).
 *
 * `cascade` is a named repository option now instead of a raw `params: { cascade: 1 }` bag — it
 * drops the cloud's dependent records along with the cloud row, and the wire encoding stays in
 * `data`.
 */
export const useDeleteCloud = () => {
    const { cloud } = runtime.data.useRuntimeRepositories();

    return useCustomMutation<DomainCloud, string, { id: string; cascade?: boolean }>(({ id, cascade }) =>
        cloud.releaseCloud(id, { cascade })
    );
};
