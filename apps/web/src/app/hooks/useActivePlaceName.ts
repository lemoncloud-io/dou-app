import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime-react';

import { type PlaceNameSource, resolvePlaceDisplayName } from '../utils/resolvePlaceDisplayName';

export const useActivePlaceName = (): string => {
    const { place: placeRepository } = runtime.data.useRuntimeRepositories();
    const { selectedSiteId: sid, selectedCloudId } = runtime.session.useSessionSelection();
    const { t } = useTranslation();

    const [place, setPlace] = useState<PlaceNameSource | null>(null);

    useEffect(() => {
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

    return resolvePlaceDisplayName(
        place ?? (sid ? { id: sid } : null),
        { isDefaultCloud: selectedCloudId === 'default' },
        t
    );
};
