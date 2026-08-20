import { useCallback } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { cloudsKeys, subscriptionKeys, useMakeCloud, useMembershipInfo } from '@chatic/web-core';

import { IS_DEV } from '../consts';

/**
 * Adds one cloud to a membership that already has room for it.
 *
 * A purchase only ever provisions a single cloud — `POST /memberships/0` enqueues one `make` with
 * whatever email it was given, or none — so every cloud past the first on a multi-cloud tier is
 * created here. `email` is optional: the backend confirmed a cloud reaches `active` with no email
 * bound at all, so a skipped verification here just leaves one to register later (see
 * `EmailRequiredBanner`, `findUnboundClouds`) rather than blocking cloud creation on it. The server
 * owns the quota check (`guardQuota`, atomic, 409 on overflow); the app's own check just avoids
 * offering an action that would fail.
 */
export const useAddCloud = (): ((email?: string) => Promise<void>) => {
    const makeCloud = useMakeCloud();
    const queryClient = useQueryClient();
    const { data: membership } = useMembershipInfo();

    return useCallback(
        async (email?: string) => {
            await makeCloud.mutateAsync({
                body: {
                    ...(email && { email }),
                    ...(membership?.receiptId && { subscriptionId: membership.receiptId }),
                },
                // Mirrors the membership route's DEV behaviour (ADR-0060 §7) so dev never provisions
                // real infrastructure.
                ...(IS_DEV && { params: { dryRun: 1 } }),
            });
            await queryClient.invalidateQueries({ queryKey: cloudsKeys.all });
            await queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
        },
        [makeCloud, membership?.receiptId, queryClient]
    );
};
