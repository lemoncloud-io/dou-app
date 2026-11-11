import { useEffect, useState } from 'react';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
import type { DomainChat } from '@chatic/data';

import { classifyWireError, extractErrorMessage } from '../../../shared';

export type SavedCardState =
    | { status: 'idle' | 'loading' | 'failed' }
    | {
          status: 'ready';
          /** The thread's root, when the card is a thread and the root could be read. */
          root: DomainChat | null;
          /** The saved messages that could be read, oldest first — the root not among them. */
          messages: DomainChat[];
          /** The saved ids that could not be read: gone, or no longer mine to read. */
          missing: string[];
      };

interface SavedCardArgs {
    /** The cloud the channel belongs to: a channel id means nothing across clouds. */
    cid: string;
    channelId: string;
    /** The saved messages' ids. */
    ids: readonly string[];
    /** The root's chatNo when the card is a thread. */
    rootNo?: string;
    /** The card has come near the screen: nothing is read before. */
    enabled: boolean;
}

/**
 * The live messages behind one Saved page card: each saved message, and the thread root when the card is
 * a thread. Read from the cloud's chat cache, fetched from the server only when the cache lacks one. A
 * message the server says is gone, or no longer mine to read, is left out rather than failing the card.
 */
export const useSavedCard = ({ cid, channelId, ids, rootNo, enabled }: SavedCardArgs): SavedCardState => {
    const [state, setState] = useState<SavedCardState>({ status: 'idle' });
    // One string, so a new array with the same ids does not read the card again.
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
                // A deleted message stays in the cache with its content hidden. Its snapshot still has
                // the words it was saved for, so it counts as unreadable here.
                const reads = (await Promise.all(ids.map(read))).map(message =>
                    message && !message.hidden ? message : null
                );
                const missing = ids.filter((_, index) => !reads[index]);
                const saved = reads
                    .filter((message): message is DomainChat => !!message)
                    .sort((a, b) => (a.chatNo ?? Infinity) - (b.chatNo ?? Infinity));
                const isRoot = (message: DomainChat) => rootNo !== undefined && String(message.chatNo) === rootNo;
                const rootId = `${channelId}:${rootNo}`;
                // A saved root that could not be read shows as its snapshot, not again as a row.
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
