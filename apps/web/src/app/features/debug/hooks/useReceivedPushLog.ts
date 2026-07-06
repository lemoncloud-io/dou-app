import { useCallback, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';

import { useOnReceiveNotification } from '../../../bridge';
import { normalizeReceivedPush, type NormalizedPush } from '../lib';

/** A received push plus a stable id for React list rendering. */
export interface ReceivedPushEntry extends NormalizedPush {
    id: string;
}

const MAX_ENTRIES = 20;

export interface UseReceivedPushLog {
    entries: ReceivedPushEntry[];
    clear: () => void;
}

/**
 * Records foreground pushes forwarded by the native shell for the debug UI.
 *
 * Nothing on the web consumed `OnReceiveNotification` before, so foreground
 * pushes were invisible here; this both keeps a short in-memory list and mirrors
 * each receipt into the shared log buffer under the `PUSH` tag so it also shows
 * up on the Log Buffer page.
 */
export const useReceivedPushLog = (): UseReceivedPushLog => {
    const [entries, setEntries] = useState<ReceivedPushEntry[]>([]);
    const seqRef = useRef(0);

    useOnReceiveNotification(message => {
        const normalized = normalizeReceivedPush(message, Date.now());
        logger.info('PUSH', `Received notification: ${normalized.title}`, normalized);

        const id = `${normalized.receivedAt}-${(seqRef.current += 1)}`;
        setEntries(prev => [{ id, ...normalized }, ...prev].slice(0, MAX_ENTRIES));
    });

    const clear = useCallback(() => setEntries([]), []);

    return { entries, clear };
};
