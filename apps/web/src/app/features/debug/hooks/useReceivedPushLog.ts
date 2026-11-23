import { useCallback, useRef, useState } from 'react';

import { useOnReceiveNotification } from '../../../bridge';
import { normalizeReceivedPush, type NormalizedPush } from '../lib';

export interface ReceivedPushEntry extends NormalizedPush {
    id: string;
}

const MAX_ENTRIES = 20;

export interface UseReceivedPushLog {
    entries: ReceivedPushEntry[];
    clear: () => void;
}

export const useReceivedPushLog = (): UseReceivedPushLog => {
    const [entries, setEntries] = useState<ReceivedPushEntry[]>([]);
    const seqRef = useRef(0);

    useOnReceiveNotification(message => {
        const normalized = normalizeReceivedPush(message, Date.now());

        const id = `${normalized.receivedAt}-${(seqRef.current += 1)}`;
        setEntries(prev => [{ id, ...normalized }, ...prev].slice(0, MAX_ENTRIES));
    });

    const clear = useCallback(() => setEntries([]), []);

    return { entries, clear };
};
