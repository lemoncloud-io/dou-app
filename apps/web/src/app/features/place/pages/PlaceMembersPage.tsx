import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
import type { DomainPlace, DomainPlaceMember } from '@chatic/data';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { GroupLabel } from '@chatic/web-ui-kit';

import { useSelectedCloudId } from '../../../hooks';
import { PageHeader } from '../../../ui';
import { ROUTES } from '../../../routes/paths';
import { ConfirmDialog } from '../../channels/components';
import { useChannelProfiles } from '../../channels/hooks';
import { type DisplayNameSources, resolveUserName } from '../../channels/utils/displayName';
import { PlaceMemberRow } from '../components/PlaceMemberRow';
import { usePlaceMembers } from '../hooks/usePlaceMembers';
import { orderPlaceMembers, placeActionFailure } from '../lib';

const NO_PROFILE_TARGETS: string[] = [];

const REMOVE_FAILURE_KEY = {
    denied: 'placeMembers.removeDenied',
    network: 'placeSettings.networkError',
    other: 'placeMembers.removeFailed',
} as const;

/**
 * The members of one place — everyone the server lists for it, including people with no room and
 * invitees who have not accepted yet. Open to every member; only the place's owner gets a Remove
 * button, on every row but their own and the owner's, and this screen is the only place a member
 * is removed from.
 *
 * Who owns the place is the place row's `isOwner`, as on every other place screen.
 */
export const PlaceMembersPage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const { placeId } = useParams<{ placeId: string }>();
    const { place: placeRepo } = runtime.data.useRuntimeRepositories();
    const { userId } = runtime.session.useSessionIdentity();
    const cid = useSelectedCloudId();
    // The place list names me by my id in this cloud; the session id is checked too in case the two differ.
    const myUid = runtime.session.useUidInCloud(cid);

    const [place, setPlace] = useState<DomainPlace | null>(null);
    useEffect(() => {
        if (!placeId) return;
        return placeRepo.observeItem(placeId, setPlace);
    }, [placeRepo, placeId]);

    const { members, status, retry, dropMember } = usePlaceMembers(placeId ?? null);

    // Not a member: nothing here to show, so back to the place's settings.
    useEffect(() => {
        if (status !== 'forbidden' || !placeId) return;
        toast({ title: t('placeMembers.notMember') });
        navigate(ROUTES.place.settings(placeId), { replace: true });
    }, [status, placeId, navigate, toast, t]);

    // The place's profiles as the cache holds them. No ids: the member list already loaded what it
    // could, and a sync per member of the whole place is a request per person.
    const { profileMap } = useChannelProfiles(placeId ?? null, NO_PROFILE_TARGETS);

    const isMe = useCallback((id: string) => !!id && (id === myUid || id === userId), [myUid, userId]);
    const ordered = useMemo(() => orderPlaceMembers(members, isMe), [members, isMe]);
    const memberById = useMemo(() => new Map(members.map(member => [member.id, member])), [members]);
    const nameSources: DisplayNameSources = useMemo(
        () => ({
            profileMap,
            memberById,
            userId: myUid ?? userId,
            unknownLabel: t('chat.unknownUser'),
            meLabel: t('chat.me'),
        }),
        [profileMap, memberById, myUid, userId, t]
    );

    const amOwner = !!place?.isOwner;
    const [confirming, setConfirming] = useState<{ id: string; name: string } | null>(null);
    const [removingIds, setRemovingIds] = useState<ReadonlySet<string>>(new Set());

    const handleRemove = async (member: { id: string; name: string }) => {
        if (!placeId) return;
        setConfirming(null);
        setRemovingIds(prev => new Set(prev).add(member.id));
        try {
            await placeRepo.removeMember(placeId, member.id);
            dropMember(member.id);
            toast({ title: t('placeMembers.removed', { name: member.name }) });
        } catch (error) {
            const failure = placeActionFailure(error);
            logger.error('PLACE', 'Failed to remove a place member', {
                error,
                data: { placeId, userId: member.id, failure },
            });
            toast({ title: t(REMOVE_FAILURE_KEY[failure]), variant: 'destructive' });
        } finally {
            setRemovingIds(prev => {
                const next = new Set(prev);
                next.delete(member.id);
                return next;
            });
        }
    };

    const canRemove = (member: DomainPlaceMember) => amOwner && !isMe(member.id) && !member.isOwner;

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title={t('placeMembers.title')} />
            <div className="flex flex-1 flex-col overflow-y-auto pb-safe-bottom">
                {status === 'ready' ? (
                    <>
                        {/* The rows received, not the server's `total`, which can count people the
                            list then left out. */}
                        <GroupLabel label={t('placeMembers.count', { count: ordered.length })} />
                        {ordered.map(member => {
                            const name = resolveUserName(member.id, nameSources);
                            return (
                                <PlaceMemberRow
                                    key={member.id}
                                    name={name}
                                    avatar={profileMap.get(member.id)?.thumbnail || member.thumbnail || undefined}
                                    isOwner={!!member.isOwner}
                                    isMe={isMe(member.id)}
                                    onRemove={
                                        canRemove(member) ? () => setConfirming({ id: member.id, name }) : undefined
                                    }
                                    isRemoving={removingIds.has(member.id)}
                                />
                            );
                        })}
                    </>
                ) : status === 'error' ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                        <p className="text-sm text-destructive">{t('placeMembers.loadFailed')}</p>
                        <button type="button" onClick={retry} className="text-sm text-primary underline">
                            {t('placeMembers.retry')}
                        </button>
                    </div>
                ) : (
                    <div className="py-4 text-center text-sm text-muted-foreground">{t('placeMembers.loading')}</div>
                )}
            </div>

            <ConfirmDialog
                open={!!confirming}
                onOpenChange={open => (open ? undefined : setConfirming(null))}
                title={t('placeMembers.removeDialog.title', { name: confirming?.name ?? '' })}
                description={t('placeMembers.removeDialog.description')}
                confirmLabel={t('placeMembers.removeDialog.confirm')}
                onConfirm={() => confirming && void handleRemove(confirming)}
            />
        </div>
    );
};
