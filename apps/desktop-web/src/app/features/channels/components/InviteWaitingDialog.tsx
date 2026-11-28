import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, DialogFooter, toast } from '@chatic/ui-kit';
import { useCopyToClipboard } from '@chatic/design-system-components-desktop';

import {
    resolveInviteCode,
    useDesktopInviteMutations,
    useInviteCountdown,
    useSelectedChannelStore,
    toastFailure,
} from '../../../shared';
import { ConfirmDialog } from './ConfirmDialog';
import { useInviteWaitingStore } from '../stores/useInviteWaitingStore';

const POLL_INTERVAL_MS = 30_000;

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
        const rows = await listInvitesRef.current();
        setInvites(rows);
        return rows;
    }, []);

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

    const seenRef = useRef(false);
    useEffect(() => {
        seenRef.current = false;
    }, [inviteId]);

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
        const rows = await listInvites().catch(() => undefined);
        if (rows) setInvites(rows);
        return rows ?? invites;
    };

    const handleCancelConfirm = async () => {
        if (!invite?.id || isCanceling) return;
        setIsCanceling(true);
        try {
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
            toast({ title: t('invite.waiting.reissueMissing'), variant: 'destructive' });
            return;
        }
        setIsReissuing(true);
        try {
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

            const next = await createInvite({ phone, name, channelId });
            if (!next.id) throw new Error('invite.create response is missing an id');
            if (next.deeplink) copyLink(next.deeplink);
            toast({ title: t('invite.waiting.reissued') });
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
