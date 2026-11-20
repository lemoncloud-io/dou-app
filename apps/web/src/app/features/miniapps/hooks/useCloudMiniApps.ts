import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { runtime, type DomainMiniApp } from '@chatic/runtime';

import { useInvitedClouds } from '../../../hooks';
import { useCloudSessionCatalog } from '../../../hooks/useCloudCatalog';
import { cloudDisplayName } from '../../../utils/cloudDisplayName';

/** The list query of one cloud. Keyed by the cloud so a switch never shows the previous cloud's rows. */
export const miniAppsKey = (cloudId: string) => [...runtime.data.cloudsKeys.detail(cloudId), 'miniApps'] as const;

export interface MiniAppFields {
    name: string;
    url: string;
    enabled?: boolean;
}

/**
 * The open cloud's mini apps, as the relay keeps them, and the owner's writes to them.
 *
 * - `cloudId` is `null` on the Default Cloud (Home): it is the relay's, with no owner and no list.
 * - Owner only on positive evidence: the cloud is in the account's owned catalog. A cloud in neither
 *   catalog list (a paired one) is not mine, and the catalog starts empty on every mount, so the
 *   owner's controls fail closed until it has answered (`ownerKnown`).
 * - `visible` is what this person sees: every mini app for the owner, only the active ones for a
 *   member. `active` is what the hub is handed and what it may name back.
 * - Each write that succeeds puts its answer into the list query rather than reading the list
 *   again; a change made on another device is read the next time the tab opens (`staleTime: 0`).
 *   A write first cancels a read of that list still in flight: one that started before the write
 *   would land after it and put the old list back.
 */
export const useCloudMiniApps = () => {
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const cloudId = selectedCloudId && selectedCloudId !== 'default' ? selectedCloudId : null;
    const { clouds, hasCloudCatalog } = useCloudSessionCatalog();
    const ownedCloud = clouds.find(cloud => cloud.id === cloudId);
    const isOwner = !!ownedCloud;
    const { invitedClouds } = useInvitedClouds();
    const invitedCloud = invitedClouds.find(cloud => cloud.id === cloudId);
    const cloudName = ownedCloud ? cloudDisplayName(ownedCloud) : (invitedCloud?.name ?? '');

    const { cloud } = runtime.data.useRuntimeRepositories();
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: miniAppsKey(cloudId ?? ''),
        queryFn: () => cloud.listMiniApps(cloudId as string),
        enabled: cloudId !== null,
        staleTime: 0,
    });
    const apps = query.data ?? [];
    const active = apps.filter(app => app.status === 'active');

    /** Writes `change` into `forCloud`'s list — the cloud the write was made in, whatever is open now. */
    const patchList = (forCloud: string, change: (list: DomainMiniApp[]) => DomainMiniApp[]) =>
        queryClient.setQueryData<DomainMiniApp[]>(miniAppsKey(forCloud), list => (list ? change(list) : list));

    // A read that started before the write would answer with the list as it was, over the patch.
    const holdReads = ({ cloudId: forCloud }: { cloudId: string }) =>
        queryClient.cancelQueries({ queryKey: miniAppsKey(forCloud) });

    const add = useMutation({
        mutationFn: ({ cloudId: forCloud, fields }: { cloudId: string; fields: MiniAppFields }) =>
            cloud.addMiniApp(forCloud, fields),
        onMutate: holdReads,
        onSuccess: (added, { cloudId: forCloud }) => patchList(forCloud, list => [...list, added]),
    });
    const update = useMutation({
        mutationFn: ({ id, patch }: { cloudId: string; id: string; patch: Partial<MiniAppFields> }) =>
            cloud.updateMiniApp(id, patch),
        onMutate: holdReads,
        onSuccess: (updated, { cloudId: forCloud }) =>
            patchList(forCloud, list => list.map(app => (app.id === updated.id ? updated : app))),
    });
    const remove = useMutation({
        mutationFn: ({ id }: { cloudId: string; id: string }) => cloud.removeMiniApp(id),
        onMutate: holdReads,
        onSuccess: (_none, { cloudId: forCloud, id }) => patchList(forCloud, list => list.filter(app => app.id !== id)),
    });

    return {
        cloudId,
        cloudName,
        isOwner,
        /** The owned catalog has answered, so `isOwner` is the answer and not the fail-closed stand-in. */
        ownerKnown: hasCloudCatalog,
        apps,
        visible: isOwner ? apps : active,
        active,
        isLoading: cloudId !== null && query.isPending,
        isError: query.isError && query.data === undefined,
        retry: () => void query.refetch(),
        addMiniApp: (forCloud: string, fields: MiniAppFields) => add.mutateAsync({ cloudId: forCloud, fields }),
        updateMiniApp: (forCloud: string, id: string, patch: Partial<MiniAppFields>) =>
            update.mutateAsync({ cloudId: forCloud, id, patch }),
        removeMiniApp: (forCloud: string, id: string) => remove.mutateAsync({ cloudId: forCloud, id }),
    };
};

export type CloudMiniApps = ReturnType<typeof useCloudMiniApps>;
