import { useCallback } from 'react';

import { useVerifyEmail } from '@chatic/web-core';

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
 * Drives the email verification exchange (`useVerifyEmail` from web-core).
 *
 * Kept apart from {@link EmailVerifyDialog} so the dialog stays a controlled component: callers
 * decide what one leg of the exchange does. `useCloudEmailGuard` wraps this to refuse a reused
 * address before a code is sent.
 */
export const useVerifyEmailCode = (): ((request: EmailVerifyRequest) => Promise<void>) => {
    const verifyEmail = useVerifyEmail();

    return useCallback(
        async (request: EmailVerifyRequest) => {
            // Discards the mutation result: the dialog only branches on resolve vs reject.
            await verifyEmail.mutateAsync(request);
        },
        [verifyEmail]
    );
};
