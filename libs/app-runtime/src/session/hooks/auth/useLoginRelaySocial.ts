import { useMutation } from '@tanstack/react-query';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
import { relaySession, withoutToken } from '@chatic/auth';

/**
 * Promotes relay authentication with a verified native provider token.
 */
export const useLoginRelaySocial = () =>
    useMutation({
        // The answer is the account's fields: the token stays with the session.
        mutationFn: async ({ body, provider }: { body: VerifyNativeTokenBody; provider?: string | null }) =>
            withoutToken(
                await relaySession.loginBySocialToken({
                    body,
                    provider: provider as never,
                })
            ),
    });
