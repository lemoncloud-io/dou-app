import { useCallback } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { runtime, type DomainCloud } from '@chatic/runtime';
import { useCustomMutation } from '@chatic/shared';

import { subscriptionKeys } from '../../../hooks/queryKeys';
import { useMembershipInfo } from '../../../hooks/useMembership';
import { IS_DEV } from '../consts';

import type { CloudBody } from '@lemoncloud/chatic-backend-api';

const useMakeCloud = () => {
    const { cloud } = runtime.data.useRuntimeRepositories();

    return useCustomMutation<DomainCloud, string, { body: CloudBody; dryRun?: boolean }>(({ body, dryRun }) =>
        cloud.makeCloud(body, { dryRun })
    );
};

export const useAddCloud = (): (() => Promise<void>) => {
    const makeCloud = useMakeCloud();
    const queryClient = useQueryClient();
    const { data: membership } = useMembershipInfo();

    return useCallback(async () => {
        await makeCloud.mutateAsync({
            body: {
                ...(membership?.receiptId && { subscriptionId: membership.receiptId }),
            },
            ...(IS_DEV && { dryRun: true }),
        });
        await queryClient.invalidateQueries({ queryKey: runtime.data.cloudsKeys.all });
        await queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    }, [makeCloud, membership?.receiptId, queryClient]);
};
