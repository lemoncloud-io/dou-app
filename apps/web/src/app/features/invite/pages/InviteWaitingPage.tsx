import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { ChevronRight } from 'lucide-react';

import { useNavigateWithTransition } from '@chatic/shared';
import { reportError } from '@chatic/web-core';
import { ChatRoomHeader, DateDivider, DefaultAvatar, EmptyState, IconClock, MessageInput } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { cn } from '@chatic/lib/utils';

import { useMyProfile, useRelayInviteMutations, useSentInviteLog } from '../../../hooks';
import { useInviteCountdown } from '../hooks/useInviteCountdown';
import { ConfirmDialog } from '../../channels/components';
import { ROUTES } from '../../../routes/paths';
import { toError, getSocketErrorCode } from '../../../utils/errors';
import { readInternationalInput } from '../../../utils/phoneNumber';
import { useAcceptedChannelSync } from '../hooks/useAcceptedChannelSync';
import { useInviteWaitingStatus } from '../hooks/useInviteWaitingStatus';
import { useLocallyCanceledInvites } from '../hooks/useLocallyCanceledInvites';
import { useRetireInvite } from '../hooks/useRetireInvite';
import { composeInviteCode } from '../utils/inviteCode';
import { composeInviteSmsBody } from '../utils/inviteMessageCopy';
import { sendInviteMessage } from '../utils/sendInviteMessage';

/**
 * 초대 대기 화면 (ADR-0033 Track B, 취소·거절 실 API는 ADR-0043, 국제번호는 ADR-0044) — Figma
 * 3263-30072 (대기) / 3398-25887 (수락되어 입장) / 3263-30117 (거절) / 3263-30162 (만료) /
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

    const { invite, isLoading, refetch } = useInviteWaitingStatus(inviteId);
    const countdown = useInviteCountdown(invite?.expiredAt ?? undefined);
    const { isCanceled } = useLocallyCanceledInvites();
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

    /** Set while this screen retires an invite itself, so the redirect below leaves that retire alone. */
    const reissueRetireRef = useRef(false);
    useEffect(() => {
        reissueRetireRef.current = false;
    }, [inviteId]);

    // Locally dismissed (a rejected row already re-invited over, or a legacy pre-API cancel stamp)
    // or canceled server-side (e.g. from another device) — this screen has nothing live to show.
    // A retire this screen just made as part of a reissue is exempt: it is already replacing the
    // route with the new invite's waiting screen, and bouncing home would swallow that.
    const isGone = dismissedLocally || invite?.state === 'canceled';
    useEffect(() => {
        if (isGone && !reissueRetireRef.current) goHome();
    }, [isGone]);

    // The channel synced locally — hand off to the real room.
    useEffect(() => {
        if (isAccepted && syncStatus === 'ready' && invite?.channelId) {
            navigate(ROUTES.channels.room(invite.channelId), { replace: true });
        }
    }, [isAccepted, syncStatus, invite?.channelId]);

    const handleReissue = async () => {
        if (!inviteId || isReissuing || !invite) return;
        const logEntry = findByInviteId(inviteId);
        if (!logEntry) {
            // This device has no memory of the phone (e.g. storage was cleared) — nothing to reissue with.
            toast({ title: t('inviteWaiting.reissueMissingLog'), variant: 'destructive' });
            return;
        }

        // The log key IS the E.164 value the packet wants; parsing it back only recovers `country`,
        // for the `countryCode` field the packet still accepts (ADR-0044 §5 correction).
        const recipient = readInternationalInput(logEntry.phone);
        if (!recipient) {
            toast({ title: t('inviteWaiting.reissueMissingLog'), variant: 'destructive' });
            return;
        }

        setIsReissuing(true);
        let replaced = false;
        try {
            // Retire the prior invite FIRST (ADR-0043 결정 5). A pending prior must actually cancel —
            // issuing before that leaves two live codes for the same phone, and issuing after a failed
            // cancel is how the pre-API reissue used to misbehave. Expired priors are best-effort
            // tidying and never block; rejected priors are dismissed locally (see useRetireInvite).
            reissueRetireRef.current = true;
            const outcome = await retire(invite);
            if (invite.state === 'pending' && outcome !== 'canceled') {
                if (outcome === 'conflict') {
                    // Accepted in the meantime — re-ask and let the screen flip to the accepted state.
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
            reportError(toError(error));
            toast({ title: t('inviteWaiting.reissueFailed'), variant: 'destructive' });
        } finally {
            // If we stayed on this screen, re-arm the redirect guard (a dismiss may have landed).
            if (!replaced) reissueRetireRef.current = false;
            setIsReissuing(false);
        }
    };

    const handleCancelConfirm = async () => {
        if (!invite || isCanceling) return;
        const code = composeInviteCode(invite);
        if (!code) {
            // Only reachable on malformed list data — a row the server answered without its code.
            setIsCancelDialogOpen(false);
            toast({ title: t('inviteWaiting.cancelFailed'), variant: 'destructive' });
            return;
        }

        setIsCanceling(true);
        try {
            // Idempotent and final: any resolution means the invite is retired (the view can come
            // back `rejected` when the recipient declined first — the card is equally gone).
            await cancelInvite(code);
            setIsCancelDialogOpen(false);
            toast({ title: t('inviteWaiting.canceledToast') });
            goHome();
        } catch (error) {
            setIsCancelDialogOpen(false);
            if (getSocketErrorCode(error) === 409) {
                // Accepted in the meantime (01-spec L89) — re-ask and let the screen tell the truth.
                void refetch();
            } else {
                reportError(toError(error));
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

    /**
     * The in-stream status block — the pseudo-room's only "message" (Figma 3263-30072 and
     * siblings): a left-aligned bold headline over a muted explanation, in place of a chat log.
     */
    const statusBlock = (title: string, description: string, danger = false) => (
        <div className="flex flex-col gap-1 px-4 pt-1">
            <p className={cn('text-[17px] font-bold leading-[1.4]', danger ? 'text-destructive' : 'text-foreground')}>
                {title}
            </p>
            <p className="whitespace-pre-line text-[14px] font-medium leading-[20px] text-description">{description}</p>
        </div>
    );

    /** Link-validity row: clock chip + label + live remaining time, reddened once it runs out. */
    const validityCard = () => {
        if (!countdown) return null;
        const parts = [
            countdown.days > 0 && t('inviteAccept.expiry.days', { n: countdown.days }),
            countdown.hours > 0 && t('inviteAccept.expiry.hours', { n: countdown.hours }),
            t('inviteAccept.expiry.minutes', { n: countdown.minutes }),
        ].filter(Boolean);
        const spent = countdown.isExpired || countdown.isImminent;

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
                    {t('inviteAccept.expiry.remaining', { time: parts.join(' ') })}
                </span>
            </div>
        );
    };

    /**
     * 초대 다시 하기 / 초대 취소 — the two actions the design puts under the validity card.
     * A rejected invite keeps only the reissue: it is already final, so there is nothing to cancel
     * (the server would not overwrite the mark either — ADR-0043).
     */
    const actionRow = (showCancel = true) => (
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
            {showCancel && (
                <button
                    type="button"
                    onClick={() => setIsCancelDialogOpen(true)}
                    className="flex items-center gap-1 px-2 py-2.5 text-[14px] font-medium text-placeholder"
                >
                    {t('inviteWaiting.cancelInvite')}
                    <ChevronRight size={16} strokeWidth={2} />
                </button>
            )}
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

        // The recipient declined (Figma 3263-30117): the room frame stays, the validity card goes
        // (the link is spent, not ticking), and reissuing is the only action left.
        if (isRejected) {
            return (
                <div className="flex flex-col gap-5 pt-2">
                    <DateDivider label={t('chat.room.today')} />
                    {statusBlock(t('inviteWaiting.rejected.title'), t('inviteWaiting.rejected.description'), true)}
                    {actionRow(false)}
                </div>
            );
        }

        // Everything below is a live invite the recipient has not taken up yet: the design keeps the
        // room frame and swaps only the status block, so the card + actions are shared.
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

            {/* The room's composer is present but inert until the invite is accepted — the design
                shows the chat frame so the screen reads as the conversation-to-be, not a form. */}
            <div className="shrink-0 px-4 pb-safe-bottom pt-2">
                <MessageInput
                    value=""
                    onChange={() => undefined}
                    disabled
                    placeholder={t('inviteWaiting.composerPlaceholder')}
                    label={t('inviteWaiting.composerPlaceholder')}
                />
            </div>

            <ConfirmDialog
                open={isCancelDialogOpen}
                onOpenChange={setIsCancelDialogOpen}
                title={t('inviteWaiting.cancelDialog.title')}
                description={t('inviteWaiting.cancelDialog.description')}
                confirmLabel={t('inviteWaiting.cancelDialog.confirm')}
                onConfirm={handleCancelConfirm}
                isPending={isCanceling}
            />
        </div>
    );
};
