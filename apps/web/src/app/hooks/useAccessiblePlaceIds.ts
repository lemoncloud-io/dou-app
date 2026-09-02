import { useEffect, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useGlobalSession, useSessionSelection } from '@chatic/app-runtime';

/**
 * The places of the active cloud the user can actually get to — the same rows the home rail renders.
 *
 * `null` until the list has resolved. Callers must read that as "don't know yet" and not filter on
 * it: treating an unresolved list as "no places" would blank whatever it gates for a beat.
 *
 * Relay is covered too. It hides the place SECTION because a relay cloud always has exactly one
 * place, but the row is still there and `useSwitchPlace` auto-selects it (see HomePage), so the set
 * is never empty just because the rail is not drawn.
 *
 * Lives in `app/hooks`, not `features/home`, because `ui/layouts` needs it and a shared layer must
 * not reach into a feature (ADR-0046).
 */
export const useAccessiblePlaceIds = (): Set<string> | null => {
    const { place } = useRuntimeRepositories();
    const { selectedCloudId } = useSessionSelection();
    const uid = useGlobalSession().identity.userId ?? undefined;
    const cid = selectedCloudId ?? 'default';

    const [placeIds, setPlaceIds] = useState<Set<string> | null>(null);

    // Same scope pinning as the other cloud-scoped observers: the {cid, uid} override keys this off
    // the React session rather than the provider, whose ancestor commits a cloud switch after this
    // hook has already subscribed (see useHomePlaces for the full account).
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

    return placeIds;
};
