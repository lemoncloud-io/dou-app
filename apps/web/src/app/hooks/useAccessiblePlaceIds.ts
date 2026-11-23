import { useEffect, useState } from 'react';

import { runtime } from '@chatic/runtime';

import { useColdListWindowElapsed } from './useColdListWindow';

export const useAccessiblePlaceIds = (): Set<string> | null => {
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const uid = runtime.session.useGlobalSession().identity.userId ?? undefined;
    return useCloudPlaceIds({ cid: selectedCloudId ?? 'default', uid });
};

export interface CloudPartition {
    cid: string;
    uid: string | undefined;
}

export const useCloudPlaceIds = ({ cid, uid }: CloudPartition): Set<string> | null => {
    const { place } = runtime.data.useRuntimeRepositories();

    const [placeIds, setPlaceIds] = useState<Set<string> | null>(null);
    const hasColdWindowElapsed = useColdListWindowElapsed(`place:${cid}:${uid ?? ''}`);

    useEffect(() => {
        if (!place) return;
        setPlaceIds(null);
        return place.observeList(
            undefined,
            result => {
                setPlaceIds(new Set((result?.list ?? []).map(row => row.id).filter((id): id is string => !!id)));
            },
            { cid, uid }
        );
    }, [place, cid, uid]);

    if (placeIds?.size === 0 && !hasColdWindowElapsed) return null;

    return placeIds;
};
