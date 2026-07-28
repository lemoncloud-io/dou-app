import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';
import { useRuntimeRepositories } from '@chatic/app-runtime';

import { IconChevronRight, ListRow, MenuCard } from '@chatic/web-ui-kit';

import { PageHeader } from '../../../ui';
import { ChannelSortSheet } from '../components/ChannelSortSheet';
import { ROUTES } from '../../../routes/paths';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

/**
 * Place settings hub — the landing screen reached from the home profile dropdown. A titled list of
 * rows that navigate to each sub-page (place info / my place profile / channel sort). Place info is
 * owner-only, so its row is disabled for non-owners (server `isOwner` is the authority — ADR-0031).
 * "알림" is a not-yet-implemented placeholder (disabled). Channel-room management is a follow-up.
 */
export const PlaceSettingsHubPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { placeId } = useParams<{ placeId: string }>();
    const { place: placeRepo } = useRuntimeRepositories();

    const [place, setPlace] = useState<MySiteView | null>(null);
    const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);

    useEffect(() => {
        if (!placeId) {
            setPlace(null);
            return;
        }
        return placeRepo.observeItem(placeId, setPlace);
    }, [placeRepo, placeId]);

    const isOwner = !!place?.isOwner;
    const chevron = <IconChevronRight className="size-5 text-placeholder" />;

    const go = (to: string) => () => navigate(to);

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <PageHeader title={t('placeSettings.title')} />
            <div className="flex-1 overflow-y-auto px-5 py-4">
                <MenuCard>
                    <ListRow
                        title={t('placeSettings.placeInfo')}
                        subtitle={isOwner ? undefined : t('placeSettings.ownerOnly')}
                        trailing={chevron}
                        disabled={!isOwner}
                        onClick={placeId ? go(ROUTES.place.settingsInfo(placeId)) : undefined}
                    />
                    <ListRow
                        title={t('placeSettings.myProfile')}
                        trailing={chevron}
                        onClick={placeId ? go(ROUTES.place.settingsProfile(placeId)) : undefined}
                    />
                    <ListRow
                        title={t('placeSettings.channelSort')}
                        trailing={chevron}
                        onClick={placeId ? () => setIsSortSheetOpen(true) : undefined}
                    />
                    {/* Place notifications are not implemented yet — shown disabled as a placeholder. */}
                    <ListRow
                        title={t('placeSettings.notifications')}
                        subtitle={t('placeSettings.comingSoon')}
                        trailing={chevron}
                        disabled
                        onClick={() => undefined}
                    />
                </MenuCard>
            </div>

            <ChannelSortSheet open={isSortSheetOpen} onOpenChange={setIsSortSheetOpen} placeId={placeId} />
        </div>
    );
};
