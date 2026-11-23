import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainIssuedWebhook, WebhookIssueInput } from '@chatic/runtime';
import { Button } from '@chatic/ui-kit/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
} from '@chatic/ui-kit/components/ui/dialog';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import type { WebhookExpiryPresetId } from '../utils/webhookExpiry';
import { expiresAtForPreset, WEBHOOK_EXPIRY_PRESETS } from '../utils/webhookExpiry';
import { copyMessageToClipboard } from '../utils/copyMessageToClipboard';

interface IssueWebhookDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onIssue: (input: WebhookIssueInput) => Promise<DomainIssuedWebhook>;
}

const CopyRow = ({ label, value }: { label: string; value: string }) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const handleCopy = () => {
        copyMessageToClipboard(value)
            .then(copied =>
                toast(
                    copied
                        ? { title: t('chat.settings.webhooks.copied') }
                        : { title: t('chat.settings.webhooks.copyFailed'), variant: 'destructive' }
                )
            )
            .catch(() => toast({ title: t('chat.settings.webhooks.copyFailed'), variant: 'destructive' }));
    };
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[12px] text-description">{label}</span>
            <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 select-all break-all font-mono text-[14px] text-foreground">{value}</span>
                <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={handleCopy}>
                    {t('chat.settings.webhooks.copy')}
                </Button>
            </div>
        </div>
    );
};

export const IssueWebhookDialog = ({ open, onOpenChange, onIssue }: IssueWebhookDialogProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [name, setName] = useState('');
    const [expiry, setExpiry] = useState<WebhookExpiryPresetId>('never');
    const [pending, setPending] = useState(false);
    const [issued, setIssued] = useState<DomainIssuedWebhook | null>(null);

    useEffect(() => {
        if (!open) {
            setName('');
            setExpiry('never');
            setPending(false);
            setIssued(null);
        }
    }, [open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pending) return;
        setPending(true);
        try {
            const trimmed = name.trim();
            setIssued(await onIssue({ ...(trimmed ? { name: trimmed } : {}), expiresAt: expiresAtForPreset(expiry) }));
        } catch {
            toast({ title: t('chat.settings.webhooks.createFailed'), variant: 'destructive' });
        } finally {
            setPending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={next => !pending && onOpenChange(next)}>
            <DialogContent closeLabel={t('chat.settings.close')} className="max-w-[340px] rounded-[12px]">
                {issued ? (
                    <div className="flex flex-col gap-4">
                        <DialogTitle>{t('chat.settings.webhooks.createdTitle')}</DialogTitle>
                        <DialogDescription>{t('chat.settings.webhooks.shownOnce')}</DialogDescription>
                        <CopyRow label={t('chat.settings.webhooks.tokenLabel')} value={issued.token} />
                        {issued.location ? (
                            <CopyRow label={t('chat.settings.webhooks.endpointLabel')} value={issued.location} />
                        ) : (
                            <p className="text-[12px] text-description">{t('chat.settings.webhooks.noEndpoint')}</p>
                        )}
                        <DialogFooter>
                            <Button type="button" onClick={() => onOpenChange(false)}>
                                {t('chat.settings.webhooks.done')}
                            </Button>
                        </DialogFooter>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <DialogTitle>{t('chat.settings.webhooks.issueTitle')}</DialogTitle>
                        <DialogDescription className="sr-only">{t('chat.settings.webhooks.hint')}</DialogDescription>
                        <label className="flex flex-col gap-1">
                            <span className="text-[12px] text-description">
                                {t('chat.settings.webhooks.nameLabel')}
                            </span>
                            <Input
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder={t('chat.settings.webhooks.namePlaceholder')}
                                maxLength={40}
                                disabled={pending}
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[12px] text-description">
                                {t('chat.settings.webhooks.expiryLabel')}
                            </span>
                            <select
                                value={expiry}
                                onChange={e => setExpiry(e.target.value as WebhookExpiryPresetId)}
                                disabled={pending}
                                className="h-10 rounded-md border border-input bg-background px-2 text-[14px]"
                            >
                                {WEBHOOK_EXPIRY_PRESETS.map(preset => (
                                    <option key={preset.id} value={preset.id}>
                                        {t(preset.labelKey)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <DialogFooter className="gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={pending}
                            >
                                {t('chat.settings.webhooks.cancel')}
                            </Button>
                            <Button type="submit" disabled={pending}>
                                {pending ? t('chat.settings.webhooks.creating') : t('chat.settings.webhooks.create')}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
};
