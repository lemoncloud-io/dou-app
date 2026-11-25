import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime-react';
import { logger } from '@chatic/bridges';

import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogFooter,
    Input,
    Label,
    toast,
} from '@chatic/ui-kit';

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

const TRANSPORT_STATUSES = new Set([408, 499, 503]);

const sendFailureKind = (error: unknown, raw: string): WireErrorKind => {
    const status = socketErrorStatus(error);
    if (status === 403) return 'denied';
    if (status === 400) return 'invalid';
    if (status !== undefined && TRANSPORT_STATUSES.has(status)) return 'network';
    return classifyWireError(raw);
};

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
    const [error, setError] = useState<{ text: string; detail?: string } | null>(null);

    const reset = () => {
        setName('');
        setPhone('');
        setError(null);
    };

    const handleOpenChange = (next: boolean) => {
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
            const placeId = target.kind === 'place' ? target.id : selectedSiteId;
            if (myUid && placeId) useWelcomeStore.getState().markInvited(welcomeKey(myUid, placeId));
            toast({ title: t('invite.send.sent', { name: recipient }) });
            const sent = { phone: parsed.e164, name: recipient, deeplink: view.deeplink };
            reset();
            close();
            if (target.kind === 'channel') {
                useInviteWaitingStore.getState().open({
                    inviteId: view.id,
                    ...sent,
                    channelId: target.id,
                });
            } else {
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
