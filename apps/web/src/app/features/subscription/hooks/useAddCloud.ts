import { useCallback } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { runtime, type DomainCloud } from '@chatic/runtime';
import { useCustomMutation } from '@chatic/shared';

import { subscriptionKeys } from '../../../hooks/queryKeys';
import { useMembershipInfo } from '../../../hooks/useMembership';
import { IS_DEV } from '../consts';

import type { CloudBody } from '@lemoncloud/chatic-backend-api';

/**
 * Adds one cloud to a membership that already has room for it.
 *
 * A purchase only ever provisions a single cloud — `POST /memberships/0` enqueues one `make` with
 * whatever email it was given, or none — so every cloud past the first on a multi-cloud tier is
 * created here. It sends no email: a cloud reaches `active` with none bound, and its recovery email
 * is registered from cloud management afterwards, if at all (`EmailBindRequestHost`). The server
 * owns the quota check (`guardQuota`, atomic, 409 on overflow); the app's own check just avoids
 * offering an action that would fail.
 */
/**
 * Cloud creation, moved down from `@chatic/runtime`'s `data/hooks/subscription.ts` to sit with
 * its only caller. `dryRun` is a named repository option now (not a raw `params` bag) — the app asks
 * for a dry run and no longer spells the relay's wire encoding.
 */
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
            // Mirrors the membership route's DEV behaviour so dev never provisions real infrastructure.
            ...(IS_DEV && { dryRun: true }),
        });
        await queryClient.invalidateQueries({ queryKey: runtime.data.cloudsKeys.all });
        await queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    }, [makeCloud, membership?.receiptId, queryClient]);
};
