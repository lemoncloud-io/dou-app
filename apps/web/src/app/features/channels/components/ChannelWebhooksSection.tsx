import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isWebhookExpired, type DomainWebhook } from '@chatic/runtime-react';
import { BottomSheet, GroupLabel, ListRow } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { useChannelWebhooks } from '../hooks/useChannelWebhooks';
import { expiresAtForPreset, WEBHOOK_EXPIRY_PRESETS } from '../utils/webhookExpiry';
import { ConfirmDialog } from './ConfirmDialog';
import { IssueWebhookDialog } from './IssueWebhookDialog';

interface ChannelWebhooksSectionProps {
    channelId: string;
}

const formatDate = (ms: number, language: string): string => new Date(ms).toLocaleDateString(language);

export const ChannelWebhooksSection = ({ channelId }: ChannelWebhooksSectionProps) => {
    const { t, i18n } = useTranslation();
    const { toast } = useToast();
    const { webhooks, status, retry, issue, setPaused, setExpiresAt, remove } = useChannelWebhooks(channelId);
    const [issueOpen, setIssueOpen] = useState(false);
    const [sheetId, setSheetId] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const selected: DomainWebhook | undefined = webhooks.find(webhook => webhook.id === sheetId);
    const nameOf = (webhook: DomainWebhook) => webhook.name || t('chat.settings.webhooks.unnamed');

    const closeSheet = () => {
        setSheetId(null);
        setConfirmDelete(false);
    };

    const write = (run: () => Promise<void>) => {
        closeSheet();
        run().catch(() => toast({ title: t('chat.settings.webhooks.updateFailed'), variant: 'destructive' }));
    };

    const handleDelete = async () => {
        if (!selected) return;
        setDeleting(true);
        try {
            await remove(selected.id);
            closeSheet();
        } catch {
            toast({ title: t('chat.settings.webhooks.deleteFailed'), variant: 'destructive' });
        } finally {
            setDeleting(false);
        }
    };

    const subtitleOf = (webhook: DomainWebhook) =>
        [
            webhook.lastUsedAt > 0
                ? t('chat.settings.webhooks.lastUsed', { when: formatDate(webhook.lastUsedAt, i18n.language) })
                : t('chat.settings.webhooks.neverUsed'),
            webhook.expiresAt > 0
                ? t('chat.settings.webhooks.expires', { when: formatDate(webhook.expiresAt, i18n.language) })
                : t('chat.settings.webhooks.noExpiry'),
        ].join(' · ');

    const stateOf = (webhook: DomainWebhook): string | null =>
        isWebhookExpired(webhook)
            ? t('chat.settings.webhooks.expired')
            : webhook.paused
              ? t('chat.settings.webhooks.paused')
              : null;

    if (status === 'unavailable') return null;

    return (
        <>
            <GroupLabel label={t('chat.settings.webhooks.title')} />
            <ListRow
                leading={
                    <span className="flex size-10 items-center justify-center">
                        <Plus className="size-6 text-primary" />
                    </span>
                }
                title={<span className="text-primary">{t('chat.settings.webhooks.issue')}</span>}
                onClick={() => setIssueOpen(true)}
            />
            {status === 'loading' && (
                <div className="py-4 text-center text-sm text-muted-foreground" role="status">
                    {t('chat.settings.webhooks.loading')}
                </div>
            )}
            {status === 'error' && (
                <ListRow
                    title={<span className="text-destructive">{t('chat.settings.webhooks.loadFailed')}</span>}
                    trailing={<span className="text-[14px] text-primary">{t('chat.settings.webhooks.retry')}</span>}
                    onClick={retry}
                />
            )}
            {status === 'ready' && webhooks.length === 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground">
                    {t('chat.settings.webhooks.empty')}
                </div>
            )}
            {status === 'ready' &&
                webhooks.map(webhook => (
                    <ListRow
                        key={webhook.id}
                        title={nameOf(webhook)}
                        subtitle={subtitleOf(webhook)}
                        trailing={
                            stateOf(webhook) && <span className="text-[13px] text-destructive">{stateOf(webhook)}</span>
                        }
                        onClick={() => setSheetId(webhook.id)}
                    />
                ))}

            <IssueWebhookDialog open={issueOpen} onOpenChange={setIssueOpen} onIssue={issue} />
            <BottomSheet
                open={!!selected && !confirmDelete}
                onOpenChange={open => !open && closeSheet()}
                title={selected ? nameOf(selected) : ''}
                onClose={closeSheet}
                closeLabel={t('chat.settings.close')}
            >
                {selected && (
                    <div className="px-4 pb-2">
                        <ListRow
                            title={t(
                                selected.paused ? 'chat.settings.webhooks.resume' : 'chat.settings.webhooks.pause'
                            )}
                            onClick={() => write(() => setPaused(selected.id, !selected.paused))}
                        />
                        {WEBHOOK_EXPIRY_PRESETS.map(preset => (
                            <ListRow
                                key={preset.id}
                                title={`${t('chat.settings.webhooks.expiryChange')}: ${t(preset.labelKey)}`}
                                onClick={() => write(() => setExpiresAt(selected.id, expiresAtForPreset(preset.id)))}
                            />
                        ))}
                        <ListRow
                            destructive
                            title={t('chat.settings.webhooks.delete')}
                            onClick={() => setConfirmDelete(true)}
                        />
                    </div>
                )}
            </BottomSheet>
            <ConfirmDialog
                open={!!selected && confirmDelete}
                onOpenChange={open => !open && setConfirmDelete(false)}
                title={t('chat.settings.webhooks.deleteTitle')}
                description={t('chat.settings.webhooks.deleteBody', { name: selected ? nameOf(selected) : '' })}
                confirmLabel={t('chat.settings.webhooks.delete')}
                onConfirm={() => void handleDelete()}
                isPending={deleting}
                closeOnConfirm={false}
                variant="danger"
            />
        </>
    );
};
