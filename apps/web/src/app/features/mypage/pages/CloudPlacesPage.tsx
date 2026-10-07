import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';
import { IconChevronRight, IconSpinner, ImageAvatar, ListRow, PlaceAvatar } from '@chatic/web-ui-kit';

import { useActiveCloudPlaces } from '../../../hooks/useActiveCloudPlaces';
import { ROUTES } from '../../../routes/paths';
import { PageHeader } from '../../../ui/components';
import {
    MAX_PLACES,
    cloudDisplayName,
    isCloudEnterable,
    resolvePlaceDisplayName,
    resolveCloudRowState,
} from '../../../utils';
import { CloudIdentity } from '../components/CloudIdentity';
import { CloudSessionGate } from '../components/CloudSessionGate';
import { SectionLabel } from '../components/SectionLabel';
import { useEnsureCloudSession } from '../hooks/useEnsureCloudSession';
import { useOwnedCloud } from '../hooks/useOwnedCloud';

/**
 * "플레이스 관리" — the places one cloud holds (Figma 4992-49725).
 *
 * A place list is the cloud's own cache, filled by that cloud's sync: the relay has no listing of
 * another cloud's sites. So the screen enters the cloud first (`useEnsureCloudSession`) and then
 * reads the same list home reads (`useActiveCloudPlaces`). A row opens the place's settings hub,
 * which likewise addresses the active cloud. The figure is against the app's places-per-cloud
 * limit, the one home enforces when creating a place.
 */
const PlacesBody = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { places, isLoading } = useActiveCloudPlaces();

    if (isLoading) {
        return (
            <div className="flex justify-center py-10">
                <IconSpinner className="size-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <SectionLabel title={t('mypage.cloudManage.places.section')} figure={`${places.length} / ${MAX_PLACES}`} />
            {places.length === 0 ? (
                <p className="px-4 py-6 text-center text-[14px] text-description">
                    {t('mypage.cloudManage.places.empty')}
                </p>
            ) : (
                <div className="flex flex-col">
                    {places.map(place => {
                        const displayName = resolvePlaceDisplayName(place, { isDefaultCloud: false }, t) ?? '';
                        return (
                            <ListRow
                                key={place.id}
                                leading={
                                    place.thumbnail ? (
                                        <ImageAvatar src={place.thumbnail} alt={displayName} size={46} />
                                    ) : (
                                        <PlaceAvatar name={displayName} size="lg" />
                                    )
                                }
                                title={<span className="truncate">{displayName}</span>}
                                trailing={<IconChevronRight className="size-5 text-placeholder" />}
                                onClick={() => navigate(ROUTES.place.settings(place.id))}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export const CloudPlacesPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { cloudId } = useParams<{ cloudId: string }>();
    const { cloud, isResolved } = useOwnedCloud(cloudId);
    const isEnterable = !!cloud && isCloudEnterable(resolveCloudRowState(cloud));
    const session = useEnsureCloudSession(isEnterable ? cloudId : undefined);

    useEffect(() => {
        if (isResolved && !cloud) navigate(ROUTES.mypage.cloud.manage, { replace: true });
        // The hub disables this row for a cloud with no session to switch to; a typed URL
        // bypasses the hub, so the screen sends it back there rather than attempting the switch.
        if (cloud && cloudId && !isCloudEnterable(resolveCloudRowState(cloud))) {
            navigate(ROUTES.mypage.cloud.hub(cloudId), { replace: true });
        }
    }, [isResolved, cloud, cloudId, navigate]);

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
            <div className="sticky top-0 z-20 shrink-0">
                <PageHeader title={t('mypage.cloudManage.places.title')} />
            </div>
            {!cloud || !cloudId ? (
                <div className="flex justify-center pt-20">
                    <IconSpinner className="size-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="flex flex-col gap-6 pb-8 pt-4">
                    <SectionLabel title={t('mypage.cloudManage.sectionMine')} />
                    <CloudIdentity name={cloudDisplayName(cloud)} />
                    <CloudSessionGate session={session}>
                        <PlacesBody />
                    </CloudSessionGate>
                </div>
            )}
        </div>
    );
};
