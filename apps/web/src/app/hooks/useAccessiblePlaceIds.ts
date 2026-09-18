import { useEffect, useState } from 'react';

import { runtime } from '@chatic/app-runtime';

import { useColdListWindowElapsed } from './useColdListWindow';

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
    const { place } = runtime.data.useRuntimeRepositories();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const uid = runtime.session.useGlobalSession().identity.userId ?? undefined;
    const cid = selectedCloudId ?? 'default';

    const [placeIds, setPlaceIds] = useState<Set<string> | null>(null);
    const hasColdWindowElapsed = useColdListWindowElapsed(`place:${cid}:${uid ?? ''}`);

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

    // An EMPTY cache is "don't know yet" as much as an unemitted one: on a cloud this device has
    // never opened, `observeList` answers `[]` before the first snapshot has been sent. Handing that
    // back as a real (empty) set filtered every channel out of the lists and the badge for the
    // length of a cold cloud switch — the very blanking this hook's `null` exists to prevent.
    //
    // Bounded on purpose. `null` means "do not filter", so holding it indefinitely would re-open the
    // stuck app-icon badge this hook exists to close: a cloud whose places really did all go away
    // must settle on the empty set and let the filter drop their orphaned channels again.
    if (placeIds?.size === 0 && !hasColdWindowElapsed) return null;

    return placeIds;
};
