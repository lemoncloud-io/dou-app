import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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

import { parseInvitePhone, useCopyToClipboard, useDesktopInviteMutations } from '../../../shared';
import { useSendInviteStore } from '../stores/useSendInviteStore';

/**
 * Invite sender dialog: name + phone number into the channel it was opened
 * from. On success the invite link is copied (the desktop has no SMS
 * composer) and the dialog closes; a failure is announced in place and the
 * dialog stays open — a closed dialog has nowhere to show it.
 */
export const SendInviteDialog = () => {
    const { t } = useTranslation();
    const channelId = useSendInviteStore(s => s.channelId);
    const channelName = useSendInviteStore(s => s.channelName);
    const close = useSendInviteStore(s => s.close);
    const { createInvite, isMutating: isSubmitting } = useDesktopInviteMutations();
    const [, copyLink] = useCopyToClipboard();
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [error, setError] = useState<string | null>(null);

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
        if (isSubmitting || !channelId) return;
        const parsed = parseInvitePhone(phone);
        if (!name.trim() || 'error' in parsed) {
            setError(t('invite.send.invalidPhone'));
            return;
        }
        setError(null);
        try {
            const view = await createInvite({ phone: parsed.e164, name: name.trim(), channelId });
            if (!view.deeplink) {
                setError(t('invite.send.missingLink'));
                return;
            }
            copyLink(view.deeplink);
            toast({ title: t('invite.send.sent', { name: name.trim() }) });
            reset();
            close();
        } catch {
            toast({ title: t('invite.send.failed'), variant: 'destructive' });
            setError(t('invite.send.failedBody'));
        }
    };

    return (
        <Dialog open={channelId !== null} onOpenChange={handleOpenChange}>
            <DialogContent closeLabel={t('common.close')} className="sm:max-w-md">
                <DialogTitle>{t('invite.send.title', { channel: channelName })}</DialogTitle>
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
                        <p id="send-invite-error" role="alert" className="-mt-1 text-callout text-destructive">
                            {error}
                        </p>
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
