import { useCallback, useEffect, useRef } from 'react';

import { runtime } from '@chatic/runtime';

import { appBridge } from '../../bridge/appBridge';
import { useOnBackgroundStatusChanged } from '../../bridge/useHandleAppMessage';
import { useActiveCloudUnreads, useOtherCloudUnread } from '../../hooks';
import { divergenceReporter } from '../../runtime/logging/divergenceReporter';

export const UnreadBadgeRunner = (): null => {
    const { total } = useActiveCloudUnreads();
    const { total: otherTotal } = useOtherCloudUnread();

    const lastPushedRef = useRef<number | null>(null);

    const pushBadge = useCallback(() => {
        const next = total + otherTotal;
        appBridge.setBadgeCount(next);
        lastPushedRef.current = next;
    }, [total, otherTotal]);

    const checkBadge = useCallback(async () => {
        const expected = lastPushedRef.current ?? total + otherTotal;
        const native = (await runtime.appShell.iconBadge?.read()) ?? null;
        divergenceReporter.badge({ web: expected, native, active: total, others: otherTotal });
    }, [total, otherTotal]);

    const didCheckOnMountRef = useRef(false);
    useEffect(() => {
        if (didCheckOnMountRef.current) return;
        didCheckOnMountRef.current = true;
        void checkBadge();
    }, [checkBadge]);

    useEffect(() => {
        pushBadge();
    }, [pushBadge]);

    useOnBackgroundStatusChanged(message => {
        if (message.data.isForeground) {
            void checkBadge();
            pushBadge();
        }
    });

    return null;
};
