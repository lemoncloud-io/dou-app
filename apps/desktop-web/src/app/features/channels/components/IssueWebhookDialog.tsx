import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainIssuedWebhook, WebhookIssueInput } from '@chatic/runtime';
import { Button, Dialog, DialogContent, DialogFooter, DialogTitle, Input } from '@chatic/ui-kit';

import { toastFailure, useCopyToClipboard } from '../../../shared';
import type { WebhookExpiryPresetId } from '../utils';
import { expiresAtForPreset, WEBHOOK_EXPIRY_PRESETS } from '../utils';

interface IssueWebhookDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onIssue: (input: WebhookIssueInput) => Promise<DomainIssuedWebhook>;
}

const CopyRow = ({ label, value }: { label: string; value: string }) => {
    const { t } = useTranslation();
    const [copied, copy] = useCopyToClipboard();
    return (
        <div className="flex flex-col gap-1">
            <span className="text-overline text-muted-foreground">{label}</span>
            <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 select-all break-all font-mono text-callout text-foreground">{value}</span>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="focus-ring tactile shrink-0 text-primary-ink transition-colors"
                    onClick={() => copy(value)}
                >
                    {copied ? t('channels.webhooks.copied') : t('channels.webhooks.copy')}
                </Button>
            </div>
        </div>
    );
};

export const IssueWebhookDialog = ({ open, onOpenChange, onIssue }: IssueWebhookDialogProps) => {
    const { t } = useTranslation();
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
        } catch (error) {
            toastFailure(t('channels.webhooks.createFailed'), error);
        } finally {
            setPending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={next => !pending && onOpenChange(next)}>
            <DialogContent closeLabel={t('common.close')} aria-describedby={undefined} className="sm:max-w-md">
                {issued ? (
                    <>
                        <DialogTitle>{t('channels.webhooks.createdTitle')}</DialogTitle>
                        <div className="flex flex-col gap-4 pt-2">
                            <p className="text-callout text-muted-foreground" role="status">
                                {t('channels.webhooks.shownOnce')}
                            </p>
                            <CopyRow label={t('channels.webhooks.tokenLabel')} value={issued.token} />
                            {issued.location ? (
                                <CopyRow label={t('channels.webhooks.endpointLabel')} value={issued.location} />
                            ) : (
                                <p className="text-caption text-muted-foreground">
                                    {t('channels.webhooks.noEndpoint')}
                                </p>
                            )}
                            <DialogFooter className="pt-2 sm:space-x-0">
                                <Button type="button" onClick={() => onOpenChange(false)}>
                                    {t('channels.webhooks.done')}
                                </Button>
                            </DialogFooter>
                        </div>
                    </>
                ) : (
                    <>
                        <DialogTitle>{t('channels.webhooks.issueTitle')}</DialogTitle>
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                            <label className="flex flex-col gap-1 text-callout">
                                <span className="text-overline text-muted-foreground">
                                    {t('channels.webhooks.nameLabel')}
                                </span>
                                <Input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder={t('channels.webhooks.namePlaceholder')}
                                    maxLength={40}
                                    disabled={pending}
                                    className="focus-ring h-9 border-hairline bg-well text-callout shadow-well"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-callout">
                                <span className="text-overline text-muted-foreground">
                                    {t('channels.webhooks.expiryLabel')}
                                </span>
                                <select
                                    value={expiry}
                                    onChange={e => setExpiry(e.target.value as WebhookExpiryPresetId)}
                                    disabled={pending}
                                    className="focus-ring h-9 rounded-md border border-hairline bg-well px-2 text-callout"
                                >
                                    {WEBHOOK_EXPIRY_PRESETS.map(preset => (
                                        <option key={preset.id} value={preset.id}>
                                            {t(preset.labelKey)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <DialogFooter className="gap-2 pt-2 sm:space-x-0">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => onOpenChange(false)}
                                    disabled={pending}
                                >
                                    {t('channels.webhooks.cancel')}
                                </Button>
                                <Button type="submit" disabled={pending}>
                                    {pending ? t('channels.webhooks.creating') : t('channels.webhooks.create')}
                                </Button>
                            </DialogFooter>
                        </form>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
};
