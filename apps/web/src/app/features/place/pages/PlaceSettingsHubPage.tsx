import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';
import { useRuntimeRepositories } from '@chatic/app-runtime';

import { IconChevronRight, ListRow, MenuCard, Switch } from '@chatic/web-ui-kit';

import { PageHeader } from '../../../ui';
import { ChannelSortSheet } from '../components/ChannelSortSheet';
import { ROUTES } from '../../../routes/paths';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

/**
 * Place settings hub — the landing screen reached from the home profile dropdown. Three titled
 * cards: "설정" (my profile / place profile / place information), "알림" (place push toggle) and
 * "채팅방" (chat sort / chat management). The place-profile row writes, so it is owner-only and
 * disabled for non-owners (server `isOwner` is the authority — ADR-0031); the place-information row
 * only reads, so it stays open to everyone (ADR-0047). The notification toggle is still a
 * placeholder (no backend support).
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
                    {/* Read-only, so no owner gate — a member is entitled to see whose place this is. */}
                    <ListRow
                        title={t('placeSettings.placeDetail')}
                        trailing={chevron}
                        onClick={placeId ? go(ROUTES.place.settingsDetail(placeId)) : undefined}
                    />
                </MenuCard>

                <MenuCard title={t('placeSettings.sectionNotifications')}>
                    {/* UI-only toggle: place push notifications have no backend support yet, so the
                        switch is rendered disabled and holds no state. */}
                    <ListRow
                        title={t('placeSettings.placeNotifications')}
                        trailing={<Switch checked={false} disabled label={t('placeSettings.placeNotifications')} />}
                    />
                    <p className="pl-4 pr-3 text-[13px] leading-[1.2] tracking-[-0.065px] text-description">
                        {t('placeSettings.placeNotificationsDescription')}
                    </p>
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
            </div>

            <ChannelSortSheet open={isSortSheetOpen} onOpenChange={setIsSortSheetOpen} placeId={placeId} />
        </div>
    );
};
