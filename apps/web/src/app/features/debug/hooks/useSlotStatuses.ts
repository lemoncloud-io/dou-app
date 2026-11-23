import { useEffect, useState } from 'react';

import { runtime } from '@chatic/runtime';

type SlotStatus = runtime.connection.SlotStatus;

const POLL_MS = 1_000;

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
