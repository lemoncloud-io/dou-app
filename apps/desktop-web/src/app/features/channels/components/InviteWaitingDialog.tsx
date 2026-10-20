import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { Button } from '@chatic/ui-kit/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogFooter,
} from '@chatic/ui-kit/components/ui/dialog';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    resolveInviteCode,
    useCopyToClipboard,
    useDesktopInviteMutations,
    useInviteCountdown,
    useSelectedChannelStore,
    toastFailure,
} from '../../../shared';
import { ConfirmDialog } from './ConfirmDialog';
import { useInviteWaitingStore } from '../stores/useInviteWaitingStore';

/** Re-poll cadence while the dialog is open — the inviter learns of an accept only by re-asking. */
const POLL_INTERVAL_MS = 30_000;

/**
 * Sent-invite waiting dialog: live status of one invite with cancel (confirmed),
 * reissue and a copy-link action. Polls `invite.list` while open; an accepted
 * invite hands off to its channel, a canceled or vanished one closes quietly.
 */
export const InviteWaitingDialog = () => {
    const { t } = useTranslation();
    const inviteId = useInviteWaitingStore(s => s.inviteId);
    const phone = useInviteWaitingStore(s => s.phone);
    const name = useInviteWaitingStore(s => s.name);
    const deeplink = useInviteWaitingStore(s => s.deeplink);
    const channelId = useInviteWaitingStore(s => s.channelId);
    const closeWaiting = useInviteWaitingStore(s => s.close);
    const selectChannel = useSelectedChannelStore(s => s.selectChannel);
    const { listInvites, cancelInvite, createInvite } = useDesktopInviteMutations();
    const [, copyLink] = useCopyToClipboard();
    const [invites, setInvites] = useState<MyInviteView[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [confirmingCancel, setConfirmingCancel] = useState(false);
    const [isCanceling, setIsCanceling] = useState(false);
    const [isReissuing, setIsReissuing] = useState(false);

    const refresh = useCallback(async (): Promise<MyInviteView[]> => {
        // Read the repository through a ref so the polling effect below does
        // not re-subscribe on every render: the repositories object is not
        // identity-stable across renders (same reason as `useChats`' refs).
        const rows = await listInvitesRef.current();
        setInvites(rows);
        return rows;
    }, []);

    // Latest `listInvites` without making `refresh` (and the polling effect) a
    // function of the repositories object's identity.
    const listInvitesRef = useRef(listInvites);
    listInvitesRef.current = listInvites;

    useEffect(() => {
        if (!inviteId) return;
        let cancelled = false;
        setIsLoading(true);
        setInvites([]);
        refresh()
            .catch(() => undefined)
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        const timer = setInterval(() => {
            void refresh().catch(() => undefined);
        }, POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [inviteId, refresh]);

    const invite = invites.find(item => item.id === inviteId);
    const countdown = useInviteCountdown(invite?.expiredAt);
    const isExpired = !!invite && (invite.state === 'expired' || !!countdown?.isExpired);

    // Whether this inviteId has been observed at least once. A missing row
    // closes the dialog only after that: the poll right after a reissue can
    // land before the server mirrors the new row, and that absence is not
    // "gone". An id never observed stays on its loading state (with its X).
    const seenRef = useRef(false);
    useEffect(() => {
        seenRef.current = false;
    }, [inviteId]);

    // Terminal states own the dialog: accepted hands to the room, canceled or
    // vanished-after-seen closes. The countdown hook keeps ticking until the
    // close lands.
    useEffect(() => {
        if (!inviteId || isLoading) return;
        if (invite) {
            seenRef.current = true;
            if (invite.state === 'accepted') {
                if (invite.channelId) selectChannel(invite.channelId);
                closeWaiting();
            } else if (invite.state === 'canceled') {
                closeWaiting();
            }
        } else if (seenRef.current) {
            closeWaiting();
        }
    }, [inviteId, isLoading, invite, selectChannel, closeWaiting]);

    if (!inviteId) return null;

    const refetchRows = async (): Promise<MyInviteView[]> => {
        // A failed re-ask keeps the last list: an empty one would read as
        // "gone" to the terminal-state effect and close the dialog without
        // telling the sender, and the caller falls back to its error toast.
        const rows = await listInvites().catch(() => undefined);
        if (rows) setInvites(rows);
        return rows ?? invites;
    };

    const handleCancelConfirm = async () => {
        if (!invite?.id || isCanceling) return;
        // Set before the (async) code resolution below, not after — resolution
        // can itself take a network round trip, and leaving the flag unset
        // across that window would let a second click double-submit.
        setIsCanceling(true);
        try {
            // A cache-first row carries no code — resolve against the current
            // list first and fall back to one re-ask before giving up.
            const code = await resolveInviteCode(invites, async () => ({ data: await refetchRows() }), invite.id);
            if (!code) {
                setConfirmingCancel(false);
                toast({ title: t('invite.waiting.cancelFailed'), variant: 'destructive' });
                return;
            }
            await cancelInvite(code);
            setConfirmingCancel(false);
            toast({ title: t('invite.waiting.canceled') });
            closeWaiting();
        } catch (error) {
            // Accepted or canceled in the meantime: re-ask and let the states
            // above tell the truth instead of erroring on a race.
            const rows = await refetchRows();
            const current = rows.find(item => item.id === invite.id);
            if (current?.state === 'accepted' || current?.state === 'canceled' || !current) {
                setConfirmingCancel(false);
            } else {
                toastFailure(t('invite.waiting.cancelFailed'), error);
            }
        } finally {
            setIsCanceling(false);
        }
    };

    const handleReissue = async () => {
        if (!inviteId || isReissuing) return;
        if (!phone) {
            // This dialog opens with the sender's memory; without it there is
            // nothing to reissue with.
            toast({ title: t('invite.waiting.reissueMissing'), variant: 'destructive' });
            return;
        }
        setIsReissuing(true);
        try {
            // Retire the prior invite FIRST. A pending prior must actually
            // cancel — issuing before that leaves two live codes for one
            // number. Expired priors are best-effort tidying and never block.
            if (invite && invite.state !== 'accepted' && invite.state !== 'canceled') {
                const code = await resolveInviteCode(invites, async () => ({ data: await refetchRows() }), invite.id);
                if (invite.state === 'pending') {
                    if (!code) {
                        toast({ title: t('invite.waiting.reissueFailed'), variant: 'destructive' });
                        return;
                    }
                    try {
                        await cancelInvite(code);
                    } catch (error) {
                        const rows = await refetchRows();
                        if (rows.find(item => item.id === invite.id)?.state === 'accepted') return;
                        toastFailure(t('invite.waiting.reissueFailed'), error);
                        return;
                    }
                } else if (code) {
                    await cancelInvite(code).catch(() => undefined);
                }
            }

            // Carry the channel over: a reissue without it issues an unbound invite, and
            // accepting that no longer lands the recipient in the room.
            const next = await createInvite({ phone, name, channelId });
            if (!next.id) throw new Error('invite.create response is missing an id');
            if (next.deeplink) copyLink(next.deeplink);
            toast({ title: t('invite.waiting.reissued') });
            // Reset the list BEFORE switching the watched id: the terminal-state
            // effect below would otherwise read the stale absence of the new row
            // as "gone" and close the dialog it just opened.
            setInvites([]);
            setIsLoading(true);
            useInviteWaitingStore.getState().open({
                inviteId: next.id,
                phone,
                name,
                deeplink: next.deeplink ?? '',
                channelId,
            });
        } catch (error) {
            toastFailure(t('invite.waiting.reissueFailed'), error);
        } finally {
            setIsReissuing(false);
        }
    };

    const statusText = !invite
        ? t('invite.waiting.loading')
        : invite.state === 'rejected'
          ? t('invite.waiting.rejected', { name: invite.name || name })
          : isExpired
            ? t('invite.waiting.expired')
            : t('invite.waiting.pending', { name: invite.name || name });

    const timeParts = countdown
        ? [
              countdown.days > 0 && t('invite.waiting.days', { count: countdown.days }),
              countdown.hours > 0 && t('invite.waiting.hours', { count: countdown.hours }),
              t('invite.waiting.minutes', { count: countdown.minutes }),
          ].filter(Boolean)
        : [];

    const link = deeplink || invite?.deeplink || '';

    return (
        <>
            <Dialog open onOpenChange={open => !open && !isCanceling && !isReissuing && closeWaiting()}>
                <DialogContent closeLabel={t('common.close')} className="sm:max-w-md">
                    <DialogTitle>{t('invite.waiting.title')}</DialogTitle>
                    <DialogDescription>{statusText}</DialogDescription>
                    {/* Pending only: a declined invite cannot be accepted, so its clock means nothing. */}
                    {invite?.state === 'pending' && !isExpired && timeParts.length > 0 && (
                        <p role="status" className="text-caption text-muted-foreground">
                            {t('invite.waiting.timeLeft', { time: timeParts.join(' ') })}
                        </p>
                    )}
                    <DialogFooter className="gap-2 pt-2 sm:space-x-0">
                        {link && (
                            <Button type="button" variant="outline" onClick={() => copyLink(link)}>
                                {t('invite.waiting.copyLink')}
                            </Button>
                        )}
                        {invite && (invite.state === 'rejected' || isExpired) && (
                            <Button type="button" onClick={handleReissue} disabled={isReissuing}>
                                {isReissuing ? t('invite.send.sending') : t('invite.waiting.reissue')}
                            </Button>
                        )}
                        {invite?.state === 'pending' && (
                            <Button
                                type="button"
                                variant="outline"
                                className="text-destructive focus:text-destructive"
                                onClick={() => setConfirmingCancel(true)}
                            >
                                {t('invite.waiting.cancel')}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <ConfirmDialog
                open={confirmingCancel}
                onOpenChange={setConfirmingCancel}
                title={t('invite.waiting.cancelTitle')}
                description={t('invite.waiting.cancelBody', { name: invite?.name || name })}
                confirmLabel={t('invite.waiting.confirmCancel')}
                onConfirm={handleCancelConfirm}
                isPending={isCanceling}
                variant="danger"
            />
        </>
    );
};
