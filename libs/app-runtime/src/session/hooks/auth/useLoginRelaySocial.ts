import { useMutation } from '@tanstack/react-query';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
import { relaySession } from '../../auth/relaySession';

/**
 * Promotes relay authentication with a verified native provider token.
 */
export const useLoginRelaySocial = () =>
    useMutation({
        mutationFn: ({ body, provider }: { body: VerifyNativeTokenBody; provider?: string | null }) =>
            relaySession.loginBySocialToken({
                body,
                provider: provider as never,
            }),
    });
