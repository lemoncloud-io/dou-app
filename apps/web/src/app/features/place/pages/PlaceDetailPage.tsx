import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    DefaultAvatar,
    Divider,
    ImageAvatar,
    InfoField,
    ListRow,
    ProfileAvatar,
    StatusBadge,
    Text,
} from '@chatic/web-ui-kit';

import { useHomeChannels } from '../../../hooks';
import { ROUTES } from '../../../routes/paths';
import { useLogoutCloudSession } from '../../../runtime/useLogoutCloudSession';
import { PageHeader } from '../../../ui';
import { SafeAreaBottomSpacer } from '../../../ui/components/SafeAreaBottomSpacer';
import { HOME_PLACE_ID, resolvePlaceDisplayName } from '../../../utils/resolvePlaceDisplayName';
import { channelKindOf, resolveChannelTitle } from '../../channels/lib';
import { PlaceConfirmDialog } from '../components/PlaceConfirmDialog';
import { PlaceDeleteDialog, type PlaceDeleteRoom } from '../components/PlaceDeleteDialog';
import { PlaceNoticeDialog } from '../components/PlaceNoticeDialog';
import { usePlaceOwnerProfile } from '../hooks/usePlaceOwnerProfile';
import { placeActionFailure } from '../lib';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

const OWNER_AVATAR_SIZE = 36;

const LEAVE_FAILURE_KEY = {
    denied: 'placeLeave.denied',
    network: 'placeSettings.networkError',
    other: 'placeLeave.failed',
} as const;

const DELETE_FAILURE_KEY = {
    denied: 'placeDelete.denied',
    network: 'placeSettings.networkError',
    other: 'placeDelete.failed',
} as const;

export const PlaceDetailPage = () => {
    const { t, i18n } = useTranslation();
    const { placeId } = useParams<{ placeId: string }>();
    const { place: placeRepo } = runtime.data.useRuntimeRepositories();

    const [livePlace, setPlace] = useState<MySiteView | null>(null);
    const [leftPlace, setLeftPlace] = useState<MySiteView | null>(null);
    const place = livePlace ?? leftPlace;

    useEffect(() => {
        if (!placeId) {
            setPlace(null);
            return;
        }
        return placeRepo.observeItem(placeId, setPlace);
    }, [placeRepo, placeId]);

    const owner = usePlaceOwnerProfile(placeId, place?.ownerId);

    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const { isGuest } = runtime.session.useRuntimeProfile();
    const { userId: uid } = runtime.session.useSessionIdentity();
    const { logoutCloudSession } = useLogoutCloudSession();

    const [dialog, setDialog] = useState<'leave' | 'left' | 'delete' | null>(null);
    const [isPending, setIsPending] = useState(false);

    const { channels } = useHomeChannels(placeId ?? null);
    const deleteRooms = useMemo<PlaceDeleteRoom[]>(
        () =>
            channels
                .filter(channel => channelKindOf(channel.stereo) === 'group')
                .map(channel => ({
                    id: channel.id,
                    name: resolveChannelTitle({
                        channel,
                        uid: uid ?? undefined,
                        selfLabel: t('channelList.selfChannel'),
                        unnamedLabel: t('channelList.unnamedChannel'),
                        dmUnnamedLabel: t('chat.dm.unnamedPeer'),
                    }),
                    memberCount: channel.memberNo ?? channel.memberIds?.length ?? 0,
                })),
        [channels, uid, t]
    );

    const handleLeave = async () => {
        if (!placeId) return;
        const leaving = place;
        setIsPending(true);
        try {
            await placeRepo.leavePlace(placeId);
            setLeftPlace(leaving);
            setDialog('left');
        } catch (error) {
            const failure = placeActionFailure(error);
            logger.error('PLACE', 'Failed to leave the place', { error, data: { placeId, failure } });
            setDialog(null);
            toast({ title: t(LEAVE_FAILURE_KEY[failure]), variant: 'destructive' });
        } finally {
            setIsPending(false);
        }
    };

    const goToDouHome = async () => {
        setDialog(null);
        try {
            await logoutCloudSession();
        } catch (error) {
            logger.error('CLOUD', 'returning to DoU Home after leaving a place failed', { error });
        }
        navigate(ROUTES.root, { replace: true });
    };

    const handleDelete = async () => {
        if (!placeId) return;
        setIsPending(true);
        try {
            await placeRepo.deletePlace(placeId);
            setDialog(null);
            toast({ title: t('placeDelete.done') });
            navigate(ROUTES.root, { replace: true });
        } catch (error) {
            const failure = placeActionFailure(error);
            logger.error('PLACE', 'Failed to delete the place', { error, data: { placeId, failure } });
            setDialog(null);
            toast({ title: t(DELETE_FAILURE_KEY[failure]), variant: 'destructive' });
        } finally {
            setIsPending(false);
        }
    };

    const title = t('placeDetail.title');

    if (!place) {
        return (
            <div className="flex h-full flex-col bg-background">
                <PageHeader title={title} />
                <div className="flex flex-1 items-center justify-center">
                    <Text className="text-muted-foreground">{t('placeDetail.notFound')}</Text>
                </div>
            </div>
        );
    }

    const isHomePlace = place.id === HOME_PLACE_ID;
    const exitAction = isHomePlace || isGuest ? null : place.isOwner ? 'delete' : 'leave';
    const displayName = resolvePlaceDisplayName(place, { isDefaultCloud: isHomePlace }, t);
    const nameLabel = isHomePlace || place.isOwner ? 'placeDetail.nameLabel' : 'placeDetail.invitedNameLabel';
    const createdAt =
        !isHomePlace && place.createdAt
            ? new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(
                  place.createdAt
              )
            : null;

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title={title} />
            <div className="flex flex-1 flex-col gap-8 overflow-y-auto py-10">
                <div className="flex flex-col items-center px-[18px]">
                    <ProfileAvatar src={place.thumbnail || undefined} glyph={isHomePlace ? 'home' : 'place'} />
                </div>

                <div className="flex flex-col gap-6">
                    <InfoField label={t(nameLabel)}>{displayName}</InfoField>

                    {place.desc && (
                        <InfoField label={t('placeDetail.descLabel')}>
                            <Text variant="body" className="whitespace-pre-wrap text-foreground">
                                {place.desc}
                            </Text>
                        </InfoField>
                    )}

                    {createdAt && <InfoField label={t('placeDetail.createdAtLabel')}>{createdAt}</InfoField>}

                    {!isHomePlace && place.ownerId && (
                        <InfoField label={t('placeDetail.ownerLabel')}>
                            <div className="flex items-center gap-2.5 px-1 py-1.5">
                                {owner?.thumbnail ? (
                                    <ImageAvatar
                                        src={owner.thumbnail}
                                        alt={owner.nick ?? ''}
                                        size={OWNER_AVATAR_SIZE}
                                    />
                                ) : (
                                    <DefaultAvatar size={OWNER_AVATAR_SIZE} />
                                )}
                                <div className="flex min-w-0 items-center gap-1.5">
                                    <StatusBadge label={t('placeMembers.badge.owner')} variant="owner" />
                                    <Text variant="callout" className="truncate font-medium text-foreground">
                                        {owner?.nick ?? ''}
                                    </Text>
                                </div>
                            </div>
                        </InfoField>
                    )}

                    {exitAction && (
                        <>
                            <Divider variant="block" />
                            <ListRow
                                destructive
                                title={
                                    <span className="text-[15px] tracking-[-0.075px]">
                                        {t(exitAction === 'delete' ? 'placeDetail.delete' : 'placeDetail.leave')}
                                    </span>
                                }
                                onClick={() => setDialog(exitAction)}
                            />
                        </>
                    )}
                </div>
                <SafeAreaBottomSpacer />
            </div>

            <PlaceConfirmDialog
                open={dialog === 'leave'}
                onOpenChange={open => setDialog(open ? 'leave' : null)}
                title={t('placeLeave.dialog.title')}
                description={t('placeLeave.dialog.description')}
                confirmLabel={t('placeLeave.dialog.confirm')}
                onConfirm={() => void handleLeave()}
                isPending={isPending}
                closeOnConfirm={false}
            />
            <PlaceNoticeDialog
                open={dialog === 'left'}
                title={t('placeLeave.doneTitle')}
                confirmLabel={t('common.confirm')}
                onConfirm={() => void goToDouHome()}
            />
            <PlaceDeleteDialog
                open={dialog === 'delete'}
                onOpenChange={open => setDialog(open ? 'delete' : null)}
                rooms={deleteRooms}
                onConfirm={() => void handleDelete()}
                isPending={isPending}
            />
        </div>
    );
};
