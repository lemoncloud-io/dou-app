import { useEffect, useState } from 'react';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime';
import type { DomainChat } from '@chatic/runtime';

import { classifyWireError, extractErrorMessage } from '../../../shared';

export type SavedCardState =
    | { status: 'idle' | 'loading' | 'failed' }
    | {
          status: 'ready';
          root: DomainChat | null;
          messages: DomainChat[];
          missing: string[];
      };

interface SavedCardArgs {
    cid: string;
    channelId: string;
    ids: readonly string[];
    rootNo?: string;
    enabled: boolean;
}

export const useSavedCard = ({ cid, channelId, ids, rootNo, enabled }: SavedCardArgs): SavedCardState => {
    const [state, setState] = useState<SavedCardState>({ status: 'idle' });
    const idKey = ids.join('\n');

    useEffect(() => {
        if (!enabled) return;
        let active = true;
        setState(previous => (previous.status === 'ready' ? previous : { status: 'loading' }));
        const { chat } = runtime.data.getCloudRepositories(cid);

        const read = async (id: string): Promise<DomainChat | null> => {
            const cached = await chat.cacheRead(id);
            if (cached) return cached;
            try {
                return (await chat.getChat({ id })) ?? null;
            } catch (error) {
                const kind = classifyWireError(extractErrorMessage(error));
                if (kind === 'notFound' || kind === 'denied') return null;
                throw error;
            }
        };

        void (async () => {
            try {
                const ids = idKey.split('\n');
                const reads = (await Promise.all(ids.map(read))).map(message =>
                    message && !message.hidden ? message : null
                );
                const missing = ids.filter((_, index) => !reads[index]);
                const saved = reads
                    .filter((message): message is DomainChat => !!message)
                    .sort((a, b) => (a.chatNo ?? Infinity) - (b.chatNo ?? Infinity));
                const isRoot = (message: DomainChat) => rootNo !== undefined && String(message.chatNo) === rootNo;
                const rootId = `${channelId}:${rootNo}`;
                const root =
                    rootNo === undefined
                        ? null
                        : (saved.find(isRoot) ?? (ids.includes(rootId) ? null : await read(rootId)));
                if (active) {
                    setState({ status: 'ready', root, messages: saved.filter(message => !isRoot(message)), missing });
                }
            } catch (error) {
                logger.warn('CHAT', '[SavedPage] saved card unreadable', { error, data: { channelId, rootNo } });
                if (active) setState({ status: 'failed' });
            }
        })();
        return () => {
            active = false;
        };
    }, [cid, channelId, idKey, rootNo, enabled]);

    return state;
};
