import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';

import { Button } from '@chatic/ui-kit/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogFooter,
} from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Label } from '@chatic/ui-kit/components/ui/label';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    classifyWireError,
    extractErrorMessage,
    isRelayGuest,
    parseInvitePhone,
    socketErrorStatus,
    useCopyToClipboard,
    useDesktopInviteMutations,
    useWelcomeStore,
    welcomeKey,
    type WireErrorKind,
} from '../../../shared';
import { useSendInviteStore } from '../stores/useSendInviteStore';
import { useInviteWaitingStore } from '../stores/useInviteWaitingStore';
import { useInviteLinkStore } from '../stores/useInviteLinkStore';

/** Transport failures the client raises itself: a timeout, a request it dropped, no socket. */
const TRANSPORT_STATUSES = new Set([408, 499, 503]);

/**
 * Why a send failed, by the status the rejection carries before its wording: the socket manager
 * puts the server's code back on the Error, and the wording is not a contract. The text is read
 * only when there is no status.
 */
const sendFailureKind = (error: unknown, raw: string): WireErrorKind => {
    const status = socketErrorStatus(error);
    if (status === 403) return 'denied';
    if (status === 400) return 'invalid';
    if (status !== undefined && TRANSPORT_STATUSES.has(status)) return 'network';
    return classifyWireError(raw);
};

/**
 * The sentence for a refused send, and the server's own wire text beside it. The sentence is the
 * part the person can act on; the wire text goes to the log and to the toast, so the actual reason
 * can be read back without opening the console. A contact invite rides the relay, which
 * issues invites to signed-in accounts only, so its refusal reads as "sign in first" when the relay
 * user is a guest (or there is no relay user, where signing in is the remedy too). The same 403
 * also covers a banned or departed account, and a place invite is refused for reasons of its own,
 * so every other refusal gets the plain "not allowed".
 */
const describeSendFailure = (error: unknown, kind: 'channel' | 'place'): { key: string; raw: string } => {
    const raw = extractErrorMessage(error);
    logger.error('INVITE', '[SendInvite] failed', { error, raw, kind });
    return { key: sendFailureKeyOf(sendFailureKind(error, raw), kind), raw };
};

const sendFailureKeyOf = (failure: WireErrorKind, kind: 'channel' | 'place'): string => {
    switch (failure) {
        case 'denied':
            return kind === 'channel' && isRelayGuest() ? 'invite.send.signInRequired' : 'errors.notAllowed';
        case 'invalid':
            return 'invite.send.failedBody';
        case 'network':
            return 'errors.network';
        default:
            return 'errors.generic';
    }
};

/**
 * Invite sender dialog: name + phone number into the channel it was opened
 * from. On success the invite link is copied (the desktop has no SMS
 * composer) and the dialog closes; a failure is announced in place and the
 * dialog stays open — a closed dialog has nowhere to show it.
 */
export const SendInviteDialog = () => {
    const { t } = useTranslation();
    const target = useSendInviteStore(s => s.target);
    const close = useSendInviteStore(s => s.close);
    const { createInvite, requestPlaceInvite, isMutating: isSubmitting } = useDesktopInviteMutations();
    const [, copyLink] = useCopyToClipboard();
    const myUid = runtime.session.useSessionIdentity().userId;
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    // `detail` is the server's own words for a refused send. The toast carries them too; they are
    // shown here as well because this is where the person is looking.
    const [error, setError] = useState<{ text: string; detail?: string } | null>(null);

    const reset = () => {
        setName('');
        setPhone('');
        setError(null);
    };

    const handleOpenChange = (next: boolean) => {
        // Escape, the X and the backdrop are ignored while the invite is being
        // created, as in Join and AddMembers: a closed dialog has nowhere to
        // show the failure.
        if (next || isSubmitting) return;
        reset();
        close();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting || !target) return;
        const parsed = parseInvitePhone(phone);
        if (!name.trim() || 'error' in parsed) {
            setError({ text: t('invite.send.invalidPhone') });
            return;
        }
        setError(null);
        try {
            // A place invite names no room (the server reads the missing key
            // as "the place alone"); a channel invite enters its room.
            const view =
                target.kind === 'channel'
                    ? await createInvite({ phone: parsed.e164, name: name.trim(), channelId: target.id })
                    : await requestPlaceInvite({ phone: parsed.e164, name: name.trim() });
            if (!view.id || !view.deeplink) {
                setError({ text: t('invite.send.missingLink') });
                return;
            }
            const recipient = name.trim();
            copyLink(view.deeplink);
            // The place's welcome counts its invite step done; the server lists no sent invites back.
            const placeId = target.kind === 'place' ? target.id : selectedSiteId;
            if (myUid && placeId) useWelcomeStore.getState().markInvited(welcomeKey(myUid, placeId));
            toast({ title: t('invite.send.sent', { name: recipient }) });
            const sent = { phone: parsed.e164, name: recipient, deeplink: view.deeplink };
            reset();
            close();
            if (target.kind === 'channel') {
                // The send lands on the waiting dialog, as the web flow does: the
                // invite's status (and its cancel/reissue) lives there.
                useInviteWaitingStore.getState().open({
                    inviteId: view.id,
                    ...sent,
                    channelId: target.id,
                });
            } else {
                // A place invite has no waiting screen — its link screen shows
                // the link for sharing, as the web flow does.
                useInviteLinkStore.getState().open(view.deeplink);
            }
        } catch (failure) {
            const { key, raw } = describeSendFailure(failure, target.kind);
            toast({ title: t('invite.send.failed'), description: raw || undefined, variant: 'destructive' });
            setError({ text: t(key), detail: raw || undefined });
        }
    };

    return (
        <Dialog open={target !== null} onOpenChange={handleOpenChange}>
            <DialogContent closeLabel={t('common.close')} className="sm:max-w-md">
                <DialogTitle>{t('invite.send.title', { channel: target?.name ?? '' })}</DialogTitle>
                <DialogDescription>{t('invite.send.subtitle')}</DialogDescription>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="send-invite-name">{t('invite.send.name')}</Label>
                        <Input
                            id="send-invite-name"
                            autoFocus
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder={t('invite.send.namePlaceholder')}
                            disabled={isSubmitting}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="send-invite-phone">{t('invite.send.phone')}</Label>
                        <Input
                            id="send-invite-phone"
                            inputMode="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder={t('invite.send.phonePlaceholder')}
                            disabled={isSubmitting}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? 'send-invite-error' : undefined}
                        />
                    </div>
                    {error && (
                        <div id="send-invite-error" role="alert" className="-mt-1 flex flex-col gap-1">
                            <p className="text-callout text-destructive">{error.text}</p>
                            {error.detail && (
                                <p className="break-all font-mono text-caption text-muted-foreground">{error.detail}</p>
                            )}
                        </div>
                    )}
                    <DialogFooter className="gap-2 pt-2 sm:space-x-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={isSubmitting}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={isSubmitting || !name.trim() || !phone.trim()}>
                            {isSubmitting ? t('invite.send.sending') : t('invite.send.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
