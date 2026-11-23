import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime';
import type { DomainChannel } from '@chatic/runtime';

import { channelLabel, dmCounterpartId, isDmChannel } from '../utils';
import { useAuthorNames } from './useAuthorNames';
import { useSiteProfileMap } from './useSiteProfiles';

export const useChannelLabels = (channels: readonly DomainChannel[]): ((channel: DomainChannel) => string) => {
    const { t } = useTranslation();
    const myUid = runtime.session.useSessionIdentity().userId;
    const placeProfiles = useSiteProfileMap();
    const counterpartIds = useMemo(
        () =>
            channels
                .filter(isDmChannel)
                .map(channel => dmCounterpartId(channel, myUid, channel.$join?.userId))
                .filter((id): id is string => !!id),
        [channels, myUid]
    );
    const names = useAuthorNames(counterpartIds);
    const selfLabel = t('dm.you');
    return useCallback(
        (channel: DomainChannel) => channelLabel(channel, { myUid, names, placeProfiles, selfLabel }),
        [myUid, names, placeProfiles, selfLabel]
    );
};
