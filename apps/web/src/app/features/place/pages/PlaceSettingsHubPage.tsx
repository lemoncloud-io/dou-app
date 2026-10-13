import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { runtime } from '@chatic/app-runtime';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { IconChevronRight, ListRow, MenuCard, Switch } from '@chatic/web-ui-kit';

import { PageHeader } from '../../../ui';
import { ConfirmDialog } from '../../channels/components';
import { ChannelSortSheet } from '../components/ChannelSortSheet';
import { placeActionFailure } from '../lib';
import { ROUTES } from '../../../routes/paths';
import { HOME_PLACE_ID, resolvePlaceDisplayName } from '../../../utils/resolvePlaceDisplayName';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

const LEAVE_FAILURE_KEY = {
    denied: 'placeLeave.denied',
    network: 'placeSettings.networkError',
    other: 'placeLeave.failed',
} as const;

/**
 * Place settings hub — the landing screen reached from the home profile dropdown. Three titled
 * cards: "설정" (my profile / place profile / place information, previewing its introduction),
 * "알림" (place push toggle) and "채팅방" (chat sort / chat management). The place-profile row
 * writes, so it is owner-only and disabled for non-owners (server `isOwner` is the authority —
 * ADR-0031); the place-information row only reads, so it stays open to everyone (ADR-0047). The
 * notification toggle is still a placeholder (no backend support).
 *
 * Two rows exist only for a member of a real place — not on the relay's own place, which is a system
 * place nobody joins or leaves, and not for a guest. "Members" opens the member screen for everyone
 * in the place. "Leave place", at the very bottom, is for anyone but the owner, whose leave the
 * server refuses.
 */
export const PlaceSettingsHubPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { placeId } = useParams<{ placeId: string }>();
    const { toast } = useToast();
    const { place: placeRepo } = runtime.data.useRuntimeRepositories();
    const { isGuest } = runtime.session.useRuntimeProfile();

    const [place, setPlace] = useState<MySiteView | null>(null);
    const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
    const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);

    useEffect(() => {
        if (!placeId) {
            setPlace(null);
            return;
        }
        return placeRepo.observeItem(placeId, setPlace);
    }, [placeRepo, placeId]);

    const isOwner = !!place?.isOwner;
    const isMemberOfRealPlace = !!placeId && placeId !== HOME_PLACE_ID && !isGuest;
    // Waits for the row: until it arrives nobody is known not to be the owner.
    const canLeave = isMemberOfRealPlace && !!place && !isOwner;
    const chevron = <IconChevronRight className="size-5 text-placeholder" />;

    const go = (to: string) => () => navigate(to);

    // Home picks the place to show next — another of this cloud's places, or none — once the row
    // has gone from the list. The dialog stays up, spinning, until the server has answered.
    const handleLeave = async () => {
        if (!placeId) return;
        setIsLeaving(true);
        try {
            await placeRepo.leavePlace(placeId);
            setIsLeaveDialogOpen(false);
            toast({ title: t('placeLeave.done') });
            navigate(ROUTES.root, { replace: true });
        } catch (error) {
            const failure = placeActionFailure(error);
            logger.error('PLACE', 'Failed to leave the place', { error, data: { placeId, failure } });
            setIsLeaveDialogOpen(false);
            toast({ title: t(LEAVE_FAILURE_KEY[failure]), variant: 'destructive' });
        } finally {
            setIsLeaving(false);
        }
    };

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

                {canLeave && (
                    <MenuCard>
                        <ListRow
                            destructive
                            title={t('placeSettings.leavePlace')}
                            onClick={() => setIsLeaveDialogOpen(true)}
                        />
                    </MenuCard>
                )}
            </div>

            <ChannelSortSheet open={isSortSheetOpen} onOpenChange={setIsSortSheetOpen} placeId={placeId} />
            <ConfirmDialog
                open={isLeaveDialogOpen}
                onOpenChange={setIsLeaveDialogOpen}
                title={t('placeLeave.dialog.title', {
                    name: resolvePlaceDisplayName(place, { isDefaultCloud: false }, t),
                })}
                description={t('placeLeave.dialog.description')}
                confirmLabel={t('placeLeave.dialog.confirm')}
                onConfirm={() => void handleLeave()}
                isPending={isLeaving}
                closeOnConfirm={false}
            />
        </div>
    );
};
