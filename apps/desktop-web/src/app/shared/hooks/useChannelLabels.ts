import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';

import { channelLabel, dmCounterpartId, isDmChannel } from '../utils';
import { useAuthorNames } from './useAuthorNames';
import { useSiteProfileMap } from './useSiteProfiles';

/**
 * `channelLabel` bound to the session: the DM counterparts of `channels` are
 * resolved from the user cache, so a DM reads as its person wherever it shows.
 * Pass every channel the caller may label; a DM outside the list falls back to
 * the room's own name.
 */
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
