import { useEffect } from 'react';

import { runtime } from '@chatic/app-runtime';

import { reconcileCloudRecordOwners } from '../utils/cloudRecordOwnership';

/**
 * Attributes the device-wide invited-cloud records to the signed-in account (adopting records written
 * before attribution existed, and following a guest that links to an account). It runs from the
 * signed-in shell, so once per session start and again when a sign-in changes the relay uid — not in
 * the rail's render, which only reads. See `reconcileCloudRecordOwners`.
 */
export const useCloudRecordOwnership = (): void => {
    const { cloud } = runtime.data.useRuntimeRepositories();
    // Subscribes to the session; the relay uid is read off the relay token.
    runtime.session.useSessionIdentity();
    const accountId = runtime.data.getAcceptorId();

    useEffect(() => {
        if (!accountId) return;
        void reconcileCloudRecordOwners(cloud, accountId).catch(() => undefined);
    }, [cloud, accountId]);
};
