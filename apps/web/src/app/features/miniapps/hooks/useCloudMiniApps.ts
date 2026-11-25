import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { runtime, type DomainMiniApp } from '@chatic/runtime-react';

import { useInvitedClouds } from '../../../hooks';
import { useCloudSessionCatalog } from '../../../hooks/useCloudCatalog';
import { cloudDisplayName } from '../../../utils/cloudDisplayName';

export const miniAppsKey = (cloudId: string) => [...runtime.data.cloudsKeys.detail(cloudId), 'miniApps'] as const;

export interface MiniAppFields {
    name: string;
    url: string;
    enabled?: boolean;
}

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

    const patchList = (forCloud: string, change: (list: DomainMiniApp[]) => DomainMiniApp[]) =>
        queryClient.setQueryData<DomainMiniApp[]>(miniAppsKey(forCloud), list => (list ? change(list) : list));

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
