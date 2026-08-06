import { useCallback } from 'react';

import { useVerifyEmail } from '@chatic/web-core';

/** One leg of the email verification exchange: send a code, resend it, or check what was typed. */
export interface EmailVerifyRequest {
    email: string;
    step: 'send' | 'resend' | 'check';
    /** Required for `check`, ignored otherwise. */
    code?: string;
}

/**
 * Drives the email verification exchange (`useVerifyEmail` from web-core).
 *
 * Lives here rather than inside {@link EmailVerifyDialog} because the dialog is cross-cutting UI and
 * must stay free of the web-core surface to live in `ui/components` (directory-structure.md §4-5);
 * both callers — the subscription page and the home subscription sheet — pass the returned function
 * straight to the dialog's `verifyEmail`.
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
