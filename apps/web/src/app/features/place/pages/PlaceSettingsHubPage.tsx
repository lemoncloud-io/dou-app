import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';
import { runtime } from '@chatic/runtime';

import { IconChevronRight, ListRow, MenuCard } from '@chatic/web-ui-kit';

import { PageHeader } from '../../../ui';
import { SafeAreaBottomSpacer } from '../../../ui/components/SafeAreaBottomSpacer';
import { ChannelSortSheet } from '../components/ChannelSortSheet';
import { ROUTES } from '../../../routes/paths';
import { HOME_PLACE_ID } from '../../../utils/resolvePlaceDisplayName';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

/**
 * Place settings hub — the landing screen reached from the home profile dropdown. Two titled
 * cards: "설정" (my profile / place profile / place information, previewing its introduction) and
 * "대화방" (chat sort / chat management). The place-profile row writes, so it is owner-only and
 * disabled for non-owners (server `isOwner` is the authority); the place-information row only reads,
 * so it stays open to everyone. There is no place notification card: place push has no backend, and a
 * switch that cannot be turned on is not offered.
 *
 * The "Members" row exists only for a member of a real place — not on the relay's own place, a system
 * place nobody joins, and not for a guest — and opens the member screen for everyone in the place.
 * Leaving and deleting the place live on the place information screen.
 */
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
                    {/* Read-only, so no owner gate — a member is entitled to see whose place this is.
                        The introduction previews here as the subtitle; `ListRow` truncates it to one
                        line on its own, so the row keeps its height whatever the place wrote. */}
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
