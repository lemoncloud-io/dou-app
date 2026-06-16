import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useLoaderStore } from '@chatic/shared';
import { reportError, toError } from '@chatic/web-core';

import { useSelectedPlaceStore } from '../stores';
import { authPlace } from '../utils';

/**
 * Switch the active place: run the engine place auth (token refresh + re-verify
 * in cloud mode) then commit the selection to the UI store. Guarded against
 * rapid re-entry and ignores re-selecting the current place.
 */
export const useSelectPlace = () => {
    const selectedPlaceId = useSelectedPlaceStore(s => s.selectedPlaceId);
    const commitPlace = useSelectedPlaceStore(s => s.selectPlace);
    const setIsLoading = useLoaderStore(s => s.setIsLoading);
    const { t } = useTranslation();
    const switchingRef = useRef(false);

    const switchPlace = useCallback(
        async (placeId: string) => {
            if (switchingRef.current || placeId === selectedPlaceId) return;
            switchingRef.current = true;
            setIsLoading(true, t('place.switching'));
            try {
                await authPlace(placeId);
                commitPlace(placeId);
            } catch (e) {
                logger.error('SESSION', '[useSelectPlace] failed', { error: e });
                reportError(toError(e));
            } finally {
                switchingRef.current = false;
                setIsLoading(false);
            }
        },
        [selectedPlaceId, commitPlace, setIsLoading, t]
    );

    return { switchPlace };
};
