import { useCallback, useEffect, useState } from 'react';

import type { DomainIssuedWebhook, DomainWebhook, WebhookIssueInput } from '@chatic/runtime';
import { runtime } from '@chatic/runtime';

export type ChannelWebhooksStatus = 'loading' | 'ready' | 'error';

export const useChannelWebhooks = (channelId: string | null) => {
    const { webhook: webhookRepository } = runtime.data.useRuntimeRepositories();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const [webhooks, setWebhooks] = useState<DomainWebhook[]>([]);
    const [status, setStatus] = useState<ChannelWebhooksStatus>('loading');
    const [retryTick, setRetryTick] = useState(0);

    useEffect(() => {
        setWebhooks([]);
        if (!channelId) return;
        if (!isVerified) {
            setStatus('loading');
            return;
        }
        let cancelled = false;
        setStatus('loading');
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
