import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';
import { runtime } from '@chatic/runtime-react';

import { IconChevronRight, ListRow, MenuCard } from '@chatic/web-ui-kit';

import { PageHeader } from '../../../ui';
import { SafeAreaBottomSpacer } from '../../../ui/components/SafeAreaBottomSpacer';
import { ChannelSortSheet } from '../components/ChannelSortSheet';
import { ROUTES } from '../../../routes/paths';
import { HOME_PLACE_ID } from '../../../utils/resolvePlaceDisplayName';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

export const PlaceSettingsHubPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { placeId } = useParams<{ placeId: string }>();
    const { place: placeRepo } = runtime.data.useRuntimeRepositories();
    const { isGuest } = runtime.session.useRuntimeProfile();

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
    const isMemberOfRealPlace = !!placeId && placeId !== HOME_PLACE_ID && !isGuest;
    const chevron = <IconChevronRight className="size-5 text-placeholder" />;

    const go = (to: string) => () => navigate(to);

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title={t('placeSettings.title')} />
            <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-4 py-2.5">
                <MenuCard title={t('placeSettings.sectionSettings')}>
                    <ListRow
                        title={t('placeSettings.myProfile')}
                        trailing={chevron}
                        onClick={placeId ? go(ROUTES.place.settingsProfile(placeId)) : undefined}
                    />
                    <ListRow
                        title={t('placeSettings.placeProfile')}
                        subtitle={isOwner ? undefined : t('placeSettings.ownerOnly')}
                        trailing={chevron}
                        disabled={!isOwner}
                        onClick={placeId ? go(ROUTES.place.settingsEdit(placeId)) : undefined}
                    />
                    <ListRow
                        title={t('placeSettings.placeDetail')}
                        subtitle={place?.desc || undefined}
                        trailing={chevron}
                        onClick={placeId ? go(ROUTES.place.settingsDetail(placeId)) : undefined}
                    />
                    {isMemberOfRealPlace && (
                        <ListRow
                            title={t('placeSettings.members')}
                            trailing={chevron}
                            onClick={placeId ? go(ROUTES.place.settingsMembers(placeId)) : undefined}
                        />
                    )}
                </MenuCard>

                <MenuCard title={t('placeSettings.sectionChats')}>
                    <ListRow
                        title={t('placeSettings.channelSort')}
                        trailing={chevron}
                        onClick={placeId ? () => setIsSortSheetOpen(true) : undefined}
                    />
                    <ListRow
                        title={t('placeSettings.channelManage')}
                        trailing={chevron}
                        onClick={placeId ? go(ROUTES.place.settingsChannels(placeId)) : undefined}
                    />
                </MenuCard>
                <SafeAreaBottomSpacer />
            </div>

            <ChannelSortSheet open={isSortSheetOpen} onOpenChange={setIsSortSheetOpen} placeId={placeId} />
        </div>
    );
};
