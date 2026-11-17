import { useCallback, useEffect, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import type { DomainIssuedWebhook, DomainWebhook, WebhookIssueInput } from '@chatic/data';

export type ChannelWebhooksStatus = 'loading' | 'ready' | 'error';

/**
 * The channel owner's webhook list and its writes. Remote-only: nothing is cached, the list is read
 * when the section mounts (and again on the unverified→verified edge) and each write patches the local
 * list with the value that was asked for once the server accepted it. The one-time token goes back to
 * the caller of `issue` and is never held here — it must not outlive the dialog that shows it.
 *
 * Pass `channelId = null` to stay idle (a non-owner never reads the list).
 */
export const useChannelWebhooks = (channelId: string | null) => {
    const { webhook: webhookRepository } = runtime.data.useRuntimeRepositories();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const [webhooks, setWebhooks] = useState<DomainWebhook[]>([]);
    const [status, setStatus] = useState<ChannelWebhooksStatus>('loading');
    const [retryTick, setRetryTick] = useState(0);

    useEffect(() => {
        setWebhooks([]);
        if (!channelId) return;
        setStatus('loading');
        if (!isVerified) return;
        let cancelled = false;
        webhookRepository
            .list(channelId)
            .then(rows => {
                if (cancelled) return;
                setWebhooks(rows);
                setStatus('ready');
            })
            .catch(() => {
                if (!cancelled) setStatus('error');
            });
        return () => {
            cancelled = true;
        };
    }, [webhookRepository, channelId, isVerified, retryTick]);

    const retry = useCallback(() => setRetryTick(tick => tick + 1), []);

    const patch = useCallback(
        (id: string, change: Partial<DomainWebhook>) =>
            setWebhooks(rows => rows.map(row => (row.id === id ? { ...row, ...change } : row))),
        []
    );

    const issue = useCallback(
        async (input: WebhookIssueInput): Promise<DomainIssuedWebhook> => {
            if (!channelId) throw new Error('no channel');
            const issued = await webhookRepository.issue(channelId, input);
            // Only the row joins the list; `issued.token` goes back to the dialog alone.
            setWebhooks(rows => [issued.webhook, ...rows]);
            return issued;
        },
        [webhookRepository, channelId]
    );

    const setPaused = useCallback(
        async (id: string, paused: boolean) => {
            await webhookRepository.setPaused(id, paused);
            patch(id, { paused });
        },
        [webhookRepository, patch]
    );

    const setExpiresAt = useCallback(
        async (id: string, expiresAt: number) => {
            await webhookRepository.setExpiresAt(id, expiresAt);
            patch(id, { expiresAt });
        },
        [webhookRepository, patch]
    );

    const remove = useCallback(
        async (id: string) => {
            await webhookRepository.remove(id);
            setWebhooks(rows => rows.filter(row => row.id !== id));
        },
        [webhookRepository]
    );

    return { webhooks, status, retry, issue, setPaused, setExpiresAt, remove };
};
