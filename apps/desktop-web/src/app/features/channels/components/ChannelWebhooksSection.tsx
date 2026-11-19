import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainWebhook } from '@chatic/runtime';
import { isWebhookExpired } from '@chatic/runtime';
import { Badge } from '@chatic/ui-kit/components/ui/badge';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { toastFailure } from '../../../shared';
import { useChannelWebhooks } from '../hooks/useChannelWebhooks';
import type { WebhookExpiryPresetId } from '../utils';
import { expiresAtForPreset, WEBHOOK_EXPIRY_PRESETS } from '../utils';
import { ConfirmDialog } from './ConfirmDialog';
import { IssueWebhookDialog } from './IssueWebhookDialog';

interface ChannelWebhooksSectionProps {
    channelId: string;
}

const formatWhen = (ms: number, language: string): string => new Date(ms).toLocaleDateString(language);

/**
 * Channel owner's webhook management inside the settings panel: the list (name, last use, paused /
 * expired badges), issuing, pause/resume, expiry and delete behind a confirm. The host renders this
 * only for the owner of a group channel — the hook never reads the list otherwise.
 */
export const ChannelWebhooksSection = ({ channelId }: ChannelWebhooksSectionProps) => {
    const { t, i18n } = useTranslation();
    const { webhooks, status, retry, issue, setPaused, setExpiresAt, remove } = useChannelWebhooks(channelId);
    const [issueOpen, setIssueOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<DomainWebhook | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    const write = async (id: string, run: () => Promise<void>, failure: string) => {
        setBusyId(id);
        try {
            await run();
        } catch (error) {
            toastFailure(failure, error);
        } finally {
            setBusyId(null);
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await remove(deleteTarget.id);
            setDeleteTarget(null);
        } catch (error) {
            toastFailure(t('channels.webhooks.deleteFailed'), error);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <section
            className="flex flex-col gap-2 border-t border-hairline pt-4"
            aria-label={t('channels.webhooks.title')}
        >
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-overline text-muted-foreground">{t('channels.webhooks.title')}</h3>
                <Button
                    variant="outline"
                    size="sm"
                    className="focus-ring tactile transition-colors"
                    onClick={() => setIssueOpen(true)}
                >
                    {t('channels.webhooks.issue')}
                </Button>
            </div>
            <p className="text-caption text-muted-foreground">{t('channels.webhooks.hint')}</p>

            {status === 'loading' && (
                <p className="px-2 py-2 text-callout text-muted-foreground" role="status">
                    {t('channels.webhooks.loading')}
                </p>
            )}
            {status === 'error' && (
                <div className="flex items-center justify-between gap-2 px-2 py-2" role="alert">
                    <span className="text-callout text-destructive">{t('channels.webhooks.loadFailed')}</span>
                    <Button variant="ghost" size="sm" className="focus-ring text-primary-ink" onClick={retry}>
                        {t('channels.webhooks.retry')}
                    </Button>
                </div>
            )}
            {status === 'ready' && webhooks.length === 0 && (
                <p className="px-2 py-2 text-callout text-muted-foreground">{t('channels.webhooks.empty')}</p>
            )}
            {status === 'ready' && webhooks.length > 0 && (
                <ul className="flex flex-col gap-2">
                    {webhooks.map(webhook => {
                        const expired = isWebhookExpired(webhook);
                        const busy = busyId === webhook.id;
                        const name = webhook.name || t('channels.webhooks.unnamed');
                        return (
                            <li
                                key={webhook.id}
                                className="flex flex-col gap-1 rounded-lg border border-hairline bg-well p-2"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="min-w-0 flex-1 truncate text-callout text-foreground">{name}</span>
                                    {webhook.paused && (
                                        <Badge variant="secondary">{t('channels.webhooks.paused')}</Badge>
                                    )}
                                    {expired && <Badge variant="destructive">{t('channels.webhooks.expired')}</Badge>}
                                </div>
                                <p className="text-caption text-muted-foreground">
                                    {webhook.lastUsedAt > 0
                                        ? t('channels.webhooks.lastUsed', {
                                              when: formatWhen(webhook.lastUsedAt, i18n.language),
                                          })
                                        : t('channels.webhooks.neverUsed')}
                                    {' · '}
                                    {webhook.expiresAt > 0
                                        ? t('channels.webhooks.expires', {
                                              when: formatWhen(webhook.expiresAt, i18n.language),
                                          })
                                        : t('channels.webhooks.noExpiry')}
                                </p>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={busy}
                                        className="focus-ring tactile transition-colors"
                                        onClick={() =>
                                            write(
                                                webhook.id,
                                                () => setPaused(webhook.id, !webhook.paused),
                                                t('channels.webhooks.updateFailed')
                                            )
                                        }
                                    >
                                        {webhook.paused ? t('channels.webhooks.resume') : t('channels.webhooks.pause')}
                                    </Button>
                                    <select
                                        aria-label={t('channels.webhooks.expiryChange')}
                                        value=""
                                        disabled={busy}
                                        onChange={e => {
                                            const id = e.target.value as WebhookExpiryPresetId;
                                            if (!id) return;
                                            void write(
                                                webhook.id,
                                                () => setExpiresAt(webhook.id, expiresAtForPreset(id)),
                                                t('channels.webhooks.updateFailed')
                                            );
                                        }}
                                        className="focus-ring h-8 rounded-md border border-hairline bg-background px-2 text-callout"
                                    >
                                        <option value="">{t('channels.webhooks.expiryChange')}</option>
                                        {WEBHOOK_EXPIRY_PRESETS.map(preset => (
                                            <option key={preset.id} value={preset.id}>
                                                {t(preset.labelKey)}
                                            </option>
                                        ))}
                                    </select>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={busy}
                                        className="focus-ring tactile ml-auto text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => setDeleteTarget(webhook)}
                                    >
                                        {t('channels.webhooks.delete')}
                                    </Button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <IssueWebhookDialog open={issueOpen} onOpenChange={setIssueOpen} onIssue={issue} />
            <ConfirmDialog
                open={deleteTarget !== null}
                onOpenChange={open => !open && setDeleteTarget(null)}
                title={t('channels.webhooks.deleteTitle')}
                description={t('channels.webhooks.deleteBody', {
                    name: deleteTarget?.name || t('channels.webhooks.unnamed'),
                })}
                confirmLabel={t('channels.webhooks.delete')}
                onConfirm={() => void confirmDelete()}
                isPending={deleting}
            />
        </section>
    );
};
