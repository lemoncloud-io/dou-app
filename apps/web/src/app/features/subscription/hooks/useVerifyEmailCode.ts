import { useCallback } from 'react';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { useCustomMutation } from '@chatic/shared';

import { IS_DEV } from '../consts';

import type { CloudVerifyEmailBody, CloudVerifyEmailView } from '@lemoncloud/chatic-backend-api';

/**
 * One leg of the email verification exchange: send a code, resend it, check what was typed, or
 * confirm the bind to a specific cloud. `confirm` is a distinct step from `check` — checking only
 * validates the code typed back; confirming is what actually links the address to a `cloudId`.
 */
export interface EmailVerifyRequest {
    email: string;
    step: 'send' | 'resend' | 'check' | 'confirm';
    /** Required for `check`, ignored otherwise. */
    code?: string;
    /** Required for `confirm`, ignored otherwise. */
    cloudId?: string;
}

/**
 * Drives the email verification exchange.
 *
 * Kept apart from {@link EmailVerifyDialog} so the dialog stays a controlled component: callers
 * decide what one leg of the exchange does. `useCloudEmailGuard` wraps this to refuse a reused
 * address before a code is sent.
 */
/**
 * Cloud email-ownership check. Moved down from `@chatic/app-runtime`'s `data/hooks/cloud.ts` to sit
 * with its only caller (ADR-0070 decision 5, direction ②) — the `dryRun` policy below is this feature's,
 * not the runtime's.
 *
 * `dryRun` on the confirm step in dev/local keeps QA from consuming real verification state.
 */
const useVerifyEmail = () => {
    const { cloud } = runtime.data.useRuntimeRepositories();

    return useCustomMutation<CloudVerifyEmailView, string, CloudVerifyEmailBody>(body =>
        cloud.verifyCloudEmail(body, { ...(IS_DEV && body.step === 'confirm' && { dryRun: true }) })
    );
};

export const useVerifyEmailCode = (): ((request: EmailVerifyRequest) => Promise<void>) => {
    const verifyEmail = useVerifyEmail();

    return useCallback(
        async (request: EmailVerifyRequest) => {
            try {
                // Discards the mutation result: the dialog only branches on resolve vs reject.
                await verifyEmail.mutateAsync(request);
            } catch (error) {
                // The step is the whole point of this entry: all four legs share one hook and one
                // endpoint, so without it a failure says only "email verification broke" and not
                // which leg — send, resend, check or confirm. The address is not recorded (ADR-0099).
                logger.error('ACCOUNT', `email verification failed at step=${request.step}`, {
                    error,
                    data: { step: request.step, hasCode: !!request.code, hasCloudId: !!request.cloudId },
                });
                throw error;
            }
        },
        [verifyEmail]
    );
};
