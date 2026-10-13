import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
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

/**
 * Tells a member that the place they were in has been deleted by its owner, and takes them to DoU
 * Home — from wherever they are, home or a chat room. Mounted once, inside the router.
 *
 * The server sends nothing when a place is deleted. What a member's app sees is the place leaving its
 * list on the next refresh, which is also what being removed from it looks like. So when the selected
 * place drops out of the list, this asks the server about that one place: a deleted place answers 404
 * (or a row stamped `deletedAt`), one the member was merely removed from or left still answers with
 * its row, and only the first gets the notice.
 *
 * Skipped for a place the user owned — the owner deleted it themselves — and for anything that is not
 * a cloud place. One question per place that disappears; a probe that fails says nothing, so nothing
 * is shown.
 */
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
    // The answer is waited for past later list emissions (each one re-runs the effect below), so only
    // unmounting drops it.
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Remember the selected place while the list carries it — its owner flag included, since the row is
    // gone by the time the question is asked.
    useEffect(() => {
        if (cid === 'default' || !selectedSiteId) return;
        const row = places.find(place => place.id === selectedSiteId);
        if (row) watchedRef.current = { cid, id: row.id, isOwner: !!row.isOwner };
    }, [cid, selectedSiteId, places]);

    useEffect(() => {
        const watched = watchedRef.current;
        if (!watched || isLoading) return;
        // A cloud switch changes the list wholesale; the place is not gone, the cloud changed.
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
