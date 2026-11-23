import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { ChevronRight } from 'lucide-react';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { ChatRoomHeader, DateDivider, DefaultAvatar, EmptyState, IconClock, MessageInput } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cn } from '@chatic/ui-kit';

import { useMyProfile, useRelayInviteMutations, useSentInviteLog } from '../../../hooks';
import { useInviteCountdown } from '../hooks/useInviteCountdown';
import { ConfirmDialog } from '../../channels/components';
import { ROUTES } from '../../../routes/paths';
import { getSocketErrorCode } from '../../../utils/errors';
import { readInternationalInput } from '@chatic/shared/phone';
import { useAcceptedChannelSync } from '../hooks/useAcceptedChannelSync';
import { useInviteWaitingStatus } from '../hooks/useInviteWaitingStatus';
import { useLocallyCanceledInvites } from '../hooks/useLocallyCanceledInvites';
import { useRetireInvite } from '../hooks/useRetireInvite';
import { formatCountdownClock, SPACED_CLOCK_SEPARATOR } from '../utils/countdownClock';
import { resolveInviteCode } from '../utils/inviteCode';
import { composeInviteSmsBody } from '../utils/inviteMessageCopy';
import { sendInviteMessage } from '../utils/sendInviteMessage';

export const InviteWaitingPage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();
    const { inviteId } = useParams<{ inviteId: string }>();

    const { invite, invites, isLoading, refetch } = useInviteWaitingStatus(inviteId);
    const countdown = useInviteCountdown(invite?.expiredAt ?? undefined);
    const { isCanceled, markCanceled } = useLocallyCanceledInvites();
    const { createInvite, cancelInvite } = useRelayInviteMutations();
    const { retire } = useRetireInvite();
    const { record, findByInviteId } = useSentInviteLog();
    const { profile: myProfile } = useMyProfile();

    const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
    const [isCanceling, setIsCanceling] = useState(false);
    const [isReissuing, setIsReissuing] = useState(false);

    const dismissedLocally = !!inviteId && isCanceled(inviteId);
    const isAccepted = invite?.state === 'accepted';
    const isRejected = invite?.state === 'rejected';
    const { status: syncStatus } = useAcceptedChannelSync(isAccepted ? invite?.channelId : undefined);

    const goHome = () => navigate(ROUTES.home, { replace: true });

    const reissueRetireRef = useRef(false);
    useEffect(() => {
        reissueRetireRef.current = false;
    }, [inviteId]);

    const isGone = dismissedLocally || invite?.state === 'canceled';
    useEffect(() => {
        if (isGone && !reissueRetireRef.current) goHome();
    }, [isGone]);

    useEffect(() => {
        if (isAccepted && syncStatus === 'ready' && invite?.channelId) {
            navigate(ROUTES.channels.room(invite.channelId), { replace: true });
        }
    }, [isAccepted, syncStatus, invite?.channelId]);

    const handleReissue = async () => {
        if (!inviteId || isReissuing || !invite) return;
        const logEntry = findByInviteId(inviteId);
        if (!logEntry) {
            toast({ title: t('inviteWaiting.reissueMissingLog'), variant: 'destructive' });
            return;
        }

        const recipient = readInternationalInput(logEntry.phone);
        if (!recipient) {
            toast({ title: t('inviteWaiting.reissueMissingLog'), variant: 'destructive' });
            return;
        }

        setIsReissuing(true);
        let replaced = false;
        try {
            reissueRetireRef.current = true;
            const outcome = await retire(invite);
            if (invite.state === 'pending' && outcome !== 'canceled') {
                if (outcome === 'conflict') {
                    void refetch();
                } else {
                    toast({ title: t('inviteWaiting.reissueFailed'), variant: 'destructive' });
                }
                return;
            }

            const newInvite = await createInvite({
                phone: logEntry.phone,
                name: logEntry.name,
                countryCode: recipient.country,
            });
            if (!newInvite.id) throw new Error('invite.create response is missing an id');
            record(newInvite, { phone: logEntry.phone, name: logEntry.name });

            const body = composeInviteSmsBody(t, myProfile?.nick, newInvite.deeplink ?? '');
            await sendInviteMessage(logEntry.phone, body);

            toast({ title: t('inviteWaiting.reissueDone') });
            replaced = true;
            navigate(ROUTES.invite.waiting(newInvite.id), { replace: true });
        } catch (error) {
            logger.error('INVITE', '[InviteWaitingPage] reissue failed', { error });
            toast({ title: t('inviteWaiting.reissueFailed'), variant: 'destructive' });
        } finally {
            if (!replaced) reissueRetireRef.current = false;
            setIsReissuing(false);
        }
    };

    const handleCancelConfirm = async () => {
        if (!invite || !invite.id || isCanceling) return;
        if (isRejected) {
            markCanceled(invite.id);
            setIsCancelDialogOpen(false);
            toast({ title: t('inviteWaiting.canceledToast') });
            goHome();
            return;
        }
        setIsCanceling(true);
        try {
            const code = await resolveInviteCode(invites, refetch, invite.id);
            if (!code) {
                setIsCancelDialogOpen(false);
                toast({ title: t('inviteWaiting.cancelFailed'), variant: 'destructive' });
                return;
            }

            await cancelInvite(code);
            setIsCancelDialogOpen(false);
            toast({ title: t('inviteWaiting.canceledToast') });
            goHome();
        } catch (error) {
            setIsCancelDialogOpen(false);
            if (getSocketErrorCode(error) === 409) {
                void refetch();
            } else {
                logger.error('INVITE', '[InviteWaitingPage] cancel failed', { error });
                toast({ title: t('inviteWaiting.cancelFailed'), variant: 'destructive' });
            }
        } finally {
            setIsCanceling(false);
        }
    };

    const recipientName = invite?.name || t('contactInvite.unnamedRecipient');

    const header = (
        <ChatRoomHeader
            kind="direct"
            title={recipientName}
            onBack={() => navigate(-1)}
            backLabel={t('chat.room.goBack')}
            moreLabel={t('inviteWaiting.moreOptions')}
        />
    );

    const statusBlock = (title: string, description: string, danger = false) => (
        <div className="flex flex-col gap-1 px-4 pt-1">
            <p className={cn('text-[17px] font-bold leading-[1.4]', danger ? 'text-destructive' : 'text-foreground')}>
                {title}
            </p>
            <p className="whitespace-pre-line text-[14px] font-medium leading-[20px] text-description">{description}</p>
        </div>
    );

    const validityCard = () => {
        if (!countdown) return null;
        const spent = countdown.isExpired || countdown.isImminent;
        const clock = formatCountdownClock(countdown, SPACED_CLOCK_SEPARATOR);

        return (
            <div className="mx-4 flex items-center justify-center gap-2 rounded-[14px] border border-input-border bg-surface px-4 py-3">
                <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-secondary">
                    <IconClock size={14} className="text-description" />
                </span>
                <span className="text-[14px] font-semibold leading-[1.4] text-foreground">
                    {t('inviteWaiting.validityLabel')}
                </span>
                <span
                    className={cn(
                        'text-[14px] font-medium leading-[1.4]',
                        spent ? 'text-destructive' : 'text-description'
                    )}
                >
                    {countdown.isExpired ? clock : t('inviteAccept.expiry.remaining', { time: clock })}
                </span>
            </div>
        );
    };

    const actionRow = () => (
        <div className="flex items-center gap-2 px-4">
            <button
                type="button"
                onClick={handleReissue}
                disabled={isReissuing}
                className="flex items-center gap-1 rounded-full border border-input-border py-2.5 pl-4 pr-3 text-[14px] font-semibold text-foreground disabled:opacity-50"
            >
                {t('inviteWaiting.reissue')}
                <ChevronRight size={16} strokeWidth={2} />
            </button>
            <button
                type="button"
                onClick={() => setIsCancelDialogOpen(true)}
                className="flex items-center gap-1 px-2 py-2.5 text-[14px] font-medium text-placeholder"
            >
                {t('inviteWaiting.cancelInvite')}
                <ChevronRight size={16} strokeWidth={2} />
            </button>
        </div>
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
            return (
                <EmptyState
                    title={t('inviteWaiting.accepted.title')}
                    description={t('inviteWaiting.accepted.description')}
                    actionLabel={t('inviteWaiting.goHome')}
                    onAction={goHome}
                />
            );
        }

        if (isRejected) {
            return (
                <div className="flex flex-col gap-5 pt-2">
                    <DateDivider label={t('chat.room.today')} />
                    {statusBlock(t('inviteWaiting.rejected.title'), t('inviteWaiting.rejected.description'), true)}
                    {actionRow()}
                </div>
            );
        }

        const isDead = invite.state === 'expired';
        return (
            <div className="flex flex-col gap-5 pt-2">
                <DateDivider label={t('chat.room.today')} />
                {isDead
                    ? statusBlock(t('inviteWaiting.expired.title'), t('inviteWaiting.expired.description'), true)
                    : statusBlock(t('inviteWaiting.pending.title'), t('inviteWaiting.pending.description'))}
                {validityCard()}
                {actionRow()}
            </div>
        );
    };

    return (
        <div className="flex h-full flex-col bg-background">
            {header}
            <div className="flex flex-1 flex-col overflow-y-auto">{renderBody()}</div>

            <div className="shrink-0 px-4 pb-safe-bottom pt-2">
                <MessageInput
                    value=""
                    onChange={() => undefined}
                    disabled
                    placeholder={t('inviteWaiting.composerPlaceholder')}
                    label={t('inviteWaiting.composerPlaceholder')}
                    sendLabel={t('common.send')}
                />
            </div>

            <ConfirmDialog
                open={isCancelDialogOpen}
                onOpenChange={setIsCancelDialogOpen}
                title={t('inviteWaiting.cancelDialog.title')}
                description={t(
                    isRejected
                        ? 'inviteWaiting.cancelDialog.rejectedDescription'
                        : 'inviteWaiting.cancelDialog.description'
                )}
                confirmLabel={t('inviteWaiting.cancelDialog.confirm')}
                onConfirm={handleCancelConfirm}
                isPending={isCanceling}
            />
        </div>
    );
};
