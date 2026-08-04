import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionSelection } from '@chatic/web-core';

import { type PlaceNameSource, resolvePlaceDisplayName } from '../features/home/lib';

/**
 * Display name of the ACTIVE place (site), observed from PlaceRepositoryV2 by the
 * selected site id. Used to label per-place UIs (e.g. the profile dialog titles)
 * outside the home rail without pulling in home-feature hooks.
 *
 * The raw `place.name` is NOT what callers want: on the relay the personal place is
 * named "default"/"#default", which would land verbatim in a dialog title. The shared
 * `resolvePlaceDisplayName` brands it, so the home place reads "두유 홈" here exactly
 * as it does in the place list. Returns the branded label on the relay even before the
 * place row is cached, and an empty string only for a nameless non-home place.
 */
export const useActivePlaceName = (): string => {
    const { place: placeRepository } = useRuntimeRepositories();
    const { selectedSiteId: sid, selectedCloudId } = useSessionSelection();
    const { t } = useTranslation();

    // Only the two fields the display rule reads, so a place-sync emit that changed neither bails out
    // of the state update. `observeItem` hands back a fresh object on every tick, and this hook feeds
    // screens that map over member lists — storing the row as-is re-renders them for nothing.
    const [place, setPlace] = useState<PlaceNameSource | null>(null);

    useEffect(() => {
        // Drop the previous site's row on every sid change, not just when sid goes away. Keeping it
        // would name the OLD place until the new subscription emits — and after branding that is not
        // merely stale but wrong: leaving the relay for a cloud would keep answering "두유 홈",
        // because the retained row still has id '0000'.
        setPlace(null);
        if (!sid) return;
        return placeRepository.observeItem(sid, item =>
            setPlace(prev =>
                prev?.id === item?.id && prev?.name === item?.name
                    ? prev
                    : item
                      ? { id: item.id, name: item.name }
                      : null
            )
        );
    }, [placeRepository, sid]);

    // Fall back to the session's sid when the place row isn't cached yet: the home branch keys off
    // the id alone, so the branded label still resolves instead of flashing an empty title.
    return resolvePlaceDisplayName(
        place ?? (sid ? { id: sid } : null),
        { isDefaultCloud: selectedCloudId === 'default' },
        t
    );
};
