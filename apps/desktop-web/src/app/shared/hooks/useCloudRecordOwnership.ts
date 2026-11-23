import { useEffect } from 'react';

import { runtime } from '@chatic/runtime';

import { reconcileCloudRecordOwners } from '../utils/cloudRecordOwnership';

export const useCloudRecordOwnership = (): void => {
    const { cloud } = runtime.data.useRuntimeRepositories();
    runtime.session.useSessionIdentity();
    const accountId = runtime.data.getAcceptorId();

    useEffect(() => {
        if (!accountId) return;
        void reconcileCloudRecordOwners(cloud, accountId).catch(() => undefined);
    }, [cloud, accountId]);
};
