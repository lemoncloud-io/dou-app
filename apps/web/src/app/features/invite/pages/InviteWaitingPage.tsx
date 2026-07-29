import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { useNavigateWithTransition } from '@chatic/shared';
import { reportError } from '@chatic/web-core';
import { ChatRoomHeader, DefaultAvatar, EmptyState } from '@chatic/web-ui-kit';
import { DropdownMenuItem } from '@chatic/ui-kit/components/ui/dropdown-menu';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useMyProfile, useRelayInviteMutations, useSentInviteLog } from '../../../hooks';
import { useInviteCountdown } from '../../home/hooks';
import { ConfirmDialog } from '../../channels/components';
import { ROUTES } from '../../../routes/paths';
import { toError } from '../../../utils/errors';
import { useAcceptedChannelSync } from '../hooks/useAcceptedChannelSync';
import { useInviteWaitingStatus } from '../hooks/useInviteWaitingStatus';
import { useLocallyCanceledInvites } from '../hooks/useLocallyCanceledInvites';
import { composeInviteSmsBody } from '../utils/inviteMessageCopy';
import { sendInviteMessage } from '../utils/sendInviteMessage';

/**
 * 초대 대기 화면 (ADR-0033 Track B) — Figma 3263-30072 (대기) / 3398-25887 (수락되어 입장) /
 * 3263-30117 (거절 — 오늘은 서버 상태 부재로 도달 불가) / 3263-30162 (만료) /
 * 3263-30207 (취소 확인) / 3413-18662 (취소 토스트).
 *
 * A pseudo-channel-room screen: same header language as a chat room (`ChatRoomHeader`), but shows
 * invite status instead of messages. Reached from `ContactInvitePage` after issuing, or from a
 * sent-invite row in `ChannelList`/`PlaceChannelManagePage`.
 */
export const InviteWaitingPage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const { inviteId } = useParams<{ inviteId: string }>();

    const { invite, isLoading } = useInviteWaitingStatus(inviteId);
    const countdown = useInviteCountdown(invite?.expiredAt ?? undefined);
    const { isCanceled, markCanceled } = useLocallyCanceledInvites();
    const { createInvite } = useRelayInviteMutations();
    const { record, findByInviteId } = useSentInviteLog();
    const { profile: myProfile } = useMyProfile();

    const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
    const [isReissuing, setIsReissuing] = useState(false);

    const canceledLocally = !!inviteId && isCanceled(inviteId);
    const isAccepted = invite?.state === 'accepted';
    const { status: syncStatus } = useAcceptedChannelSync(isAccepted ? invite?.channelId : undefined);

    const goHome = () => navigate(ROUTES.home, { replace: true });

    // A cancel confirmed on a prior visit — this device should never show it as live again.
    useEffect(() => {
        if (canceledLocally) goHome();
    }, [canceledLocally]);

    // The channel synced locally — hand off to the real room.
    useEffect(() => {
        if (isAccepted && syncStatus === 'ready' && invite?.channelId) {
            navigate(ROUTES.channels.room(invite.channelId), { replace: true });
        }
    }, [isAccepted, syncStatus, invite?.channelId]);

    const handleReissue = async () => {
        if (!inviteId || isReissuing) return;
        const logEntry = findByInviteId(inviteId);
        if (!logEntry) {
            // This device has no memory of the phone (e.g. storage was cleared) — nothing to reissue with.
            toast({ title: t('inviteWaiting.reissueMissingLog'), variant: 'destructive' });
            return;
        }

        setIsReissuing(true);
        try {
            const newInvite = await createInvite({ phone: logEntry.phone, name: logEntry.name });
            if (!newInvite.id) throw new Error('invite.create response is missing an id');
            record(newInvite, { phone: logEntry.phone, name: logEntry.name });

            const body = composeInviteSmsBody(t, myProfile?.nick, newInvite.deeplink ?? '');
            await sendInviteMessage(logEntry.phone, body);

            toast({ title: t('inviteWaiting.reissueDone') });
            navigate(ROUTES.invite.waiting(newInvite.id), { replace: true });
        } catch (error) {
            reportError(toError(error));
            toast({ title: t('inviteWaiting.reissueFailed'), variant: 'destructive' });
        } finally {
            setIsReissuing(false);
        }
    };

    const handleCancelConfirm = () => {
        if (!inviteId) return;
        // 백엔드 요청 1번(invite.cancel) 미지원 — 로컬로만 숨기고 서버 상태는 그대로 둔다.
        markCanceled(inviteId);
        setIsCancelDialogOpen(false);
        toast({ title: t('inviteWaiting.canceledToast') });
        goHome();
    };

    const recipientName = invite?.name || t('contactInvite.unnamedRecipient');

    const moreMenu =
        invite?.state === 'pending' ? (
            <DropdownMenuItem onClick={() => setIsCancelDialogOpen(true)} className="cursor-pointer text-destructive">
                {t('inviteWaiting.cancelInvite')}
            </DropdownMenuItem>
        ) : undefined;

    const header = (
        <ChatRoomHeader
            kind="direct"
            title={recipientName}
            onBack={() => navigate(-1)}
            moreMenu={moreMenu}
            backLabel={t('chat.room.goBack')}
            moreLabel={t('inviteWaiting.moreOptions')}
        />
    );

    const renderBody = () => {
        if (!invite && isLoading) {
            return (
                <div className="flex flex-1 items-center justify-center">
                    <div className="size-8 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground" />
                </div>
            );
        }

        if (!invite) {
            return (
                <EmptyState
                    title={t('inviteWaiting.notFound.title')}
                    description={t('inviteWaiting.notFound.description')}
                    actionLabel={t('inviteWaiting.goHome')}
                    onAction={goHome}
                />
            );
        }

        if (isAccepted) {
            if (syncStatus === 'waiting') {
                return (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
                        <DefaultAvatar size={64} variant="user" />
                        <p className="text-[16px] font-medium text-foreground">{t('inviteWaiting.entering')}</p>
                    </div>
                );
            }
            // 'timeout' or 'unknown' (no channelId yet — 요청 5번 미확정): best-effort hand-off.
            return (
                <EmptyState
                    title={t('inviteWaiting.accepted.title')}
                    description={t('inviteWaiting.accepted.description')}
                    actionLabel={t('inviteWaiting.goHome')}
                    onAction={goHome}
                />
            );
        }

        if (invite.state === 'expired') {
            return (
                <EmptyState
                    title={t('inviteWaiting.expired.title')}
                    description={t('inviteWaiting.expired.description')}
                    actionLabel={t('inviteWaiting.reissue')}
                    onAction={handleReissue}
                />
            );
        }

        // pending
        return (
            <>
                <EmptyState
                    title={t('inviteWaiting.pending.title')}
                    description={t('inviteWaiting.pending.description')}
                />
                {countdown && !countdown.isExpired && (
                    <p
                        className={`px-4 text-[13px] font-medium ${countdown.isImminent ? 'text-destructive' : 'text-placeholder'}`}
                    >
                        {t('inviteAccept.expiry.remaining', {
                            time: [
                                countdown.days > 0 && t('inviteAccept.expiry.days', { n: countdown.days }),
                                countdown.hours > 0 && t('inviteAccept.expiry.hours', { n: countdown.hours }),
                                t('inviteAccept.expiry.minutes', { n: countdown.minutes }),
                            ]
                                .filter(Boolean)
                                .join(' '),
                        })}
                    </p>
                )}
            </>
        );
    };

    return (
        <div className="flex h-full flex-col bg-background">
            {header}
            <div className="flex flex-1 flex-col overflow-y-auto pb-safe-bottom">{renderBody()}</div>

            <ConfirmDialog
                open={isCancelDialogOpen}
                onOpenChange={setIsCancelDialogOpen}
                title={t('inviteWaiting.cancelDialog.title')}
                description={t('inviteWaiting.cancelDialog.description')}
                confirmLabel={t('inviteWaiting.cancelDialog.confirm')}
                onConfirm={handleCancelConfirm}
            />
        </div>
    );
};
