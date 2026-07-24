import { useCallback } from 'react';

import {
    isNativeApp,
    recoverInvitedCloudIfMissing,
    useInvitedCloudColdRecovery,
    useRuntimeRepositories,
} from '@chatic/app-runtime';
import type { AppMessageData } from '@chatic/app-messages';

import { useOnReceiveNotification } from '../bridge';

/**
 * Keeps invited clouds durable against cold-DB loss. Mounted once under AppRuntime.
 *
 * - Boot: seeds/recovers invited clouds into the cold tier (native only).
 * - Push: when a foreground push names a source cloud (`data.cid`) that is not cached, re-derives
 *   and re-caches it so cross-cloud routing can resolve it. Empty cid (common on deployed backends)
 *   is a no-op — that case needs backend support (ADR-0030).
 */
export const InvitedCloudColdSyncRunner = (): null => {
    const { cloud } = useRuntimeRepositories();

    useInvitedCloudColdRecovery();

    const handleReceiveNotification = useCallback(
        (message: AppMessageData<'OnReceiveNotification'>) => {
            // Cold DB only exists in the native WebView; match the boot hook's guard.
            if (!isNativeApp()) return;
            const data = message.data?.notification?.data as Record<string, unknown> | undefined;
            const cid = typeof data?.cid === 'string' ? data.cid : undefined;
            void recoverInvitedCloudIfMissing(cloud, cid);
        },
        [cloud]
    );

    useOnReceiveNotification(handleReceiveNotification);

    return null;
};
