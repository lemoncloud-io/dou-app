import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime';
import { useNavigateWithTransition } from '@chatic/shared';

import { useActiveCloudPlaces, useSelectedCloudId } from '../../../hooks';
import { ROUTES } from '../../../routes/paths';
import { useLogoutCloudSession } from '../../../runtime/useLogoutCloudSession';
import { PlaceNoticeDialog } from './PlaceNoticeDialog';

interface WatchedPlace {
    cid: string;
    id: string;
    isOwner: boolean;
}

export const PlaceDeletedNotice = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { place: placeRepo } = runtime.data.useRuntimeRepositories();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const cid = useSelectedCloudId();
    const { places, isLoading } = useActiveCloudPlaces();
    const { logoutCloudSession } = useLogoutCloudSession();

    const watchedRef = useRef<WatchedPlace | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (cid === 'default' || !selectedSiteId) return;
        const row = places.find(place => place.id === selectedSiteId);
        if (row) watchedRef.current = { cid, id: row.id, isOwner: !!row.isOwner };
    }, [cid, selectedSiteId, places]);

    useEffect(() => {
        const watched = watchedRef.current;
        if (!watched || isLoading) return;
        if (watched.cid !== cid) {
            watchedRef.current = null;
            return;
        }
        if (places.some(place => place.id === watched.id)) return;
        watchedRef.current = null;
        if (watched.isOwner) return;
        placeRepo
            .isPlaceDeleted(watched.id)
            .then(deleted => {
                if (mountedRef.current && deleted) setIsOpen(true);
            })
            .catch(error => {
                logger.warn('PLACE', '[PlaceDeletedNotice] could not tell whether a vanished place was deleted', {
                    error,
                    data: { placeId: watched.id },
                });
            });
    }, [places, isLoading, cid, placeRepo]);

    const goToDouHome = async () => {
        setIsOpen(false);
        try {
            await logoutCloudSession();
        } catch (error) {
            logger.error('CLOUD', 'returning to DoU Home after a place was deleted failed', { error });
        }
        navigate(ROUTES.root, { replace: true });
    };

    return (
        <PlaceNoticeDialog
            open={isOpen}
            title={t('placeDeleted.title')}
            description={t('placeDeleted.description')}
            confirmLabel={t('common.confirm')}
            onConfirm={() => void goToDouHome()}
        />
    );
};
