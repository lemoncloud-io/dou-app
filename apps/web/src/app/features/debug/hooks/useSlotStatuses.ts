import { useEffect, useState } from 'react';

import { runtime } from '@chatic/app-runtime';

type SlotStatus = runtime.connection.SlotStatus;

/** Often enough to watch a reconnect or a switch happen, cheap enough to leave the panel open. */
const POLL_MS = 1_000;

/**
 * Every bound socket slot — relay, the committed cloud and each background cloud — read once a
 * second. Polled rather than subscribed: `getSlotStatuses` is a telemetry snapshot with no listener of
 * its own, and a debug screen is the one reader that can afford a timer.
 */
export const useSlotStatuses = (): SlotStatus[] => {
    const [statuses, setStatuses] = useState<SlotStatus[]>(() =>
        runtime.connection.getSocketManager().getSlotStatuses()
    );

    useEffect(() => {
        const read = () => setStatuses(runtime.connection.getSocketManager().getSlotStatuses());
        read();
        const handle = setInterval(read, POLL_MS);
        return () => clearInterval(handle);
    }, []);

    return statuses;
};
