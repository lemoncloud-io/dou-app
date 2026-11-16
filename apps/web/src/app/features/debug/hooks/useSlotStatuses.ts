import { useEffect, useState } from 'react';

import { runtime } from '@chatic/app-runtime';

type SlotStatus = runtime.connection.SlotStatus;

/** Often enough to watch a reconnect or a switch happen, cheap enough to leave the panel open. */
const POLL_MS = 1_000;

/**
 * Every bound socket slot — relay, the committed cloud and each background cloud — read once a
 * second. Polled rather than subscribed: `getSlotStatuses` is a telemetry snapshot with no listener of
 * its own, and a debug screen is the one reader that can afford a timer.
 *
 * The read is asynchronous (the sockets may live in another process), so the list starts empty and
 * fills in with the first answer. An answer that lands after a newer read was started, or after
 * unmount, is dropped; a failed read keeps the last list.
 */
export const useSlotStatuses = (): SlotStatus[] => {
    const [statuses, setStatuses] = useState<SlotStatus[]>([]);

    useEffect(() => {
        let latest = 0;
        let active = true;
        const read = () => {
            const seq = ++latest;
            runtime.connection.getSlotStatuses().then(
                next => {
                    if (active && seq === latest) setStatuses(next);
                },
                () => undefined
            );
        };
        read();
        const handle = setInterval(read, POLL_MS);
        return () => {
            active = false;
            clearInterval(handle);
        };
    }, []);

    return statuses;
};
