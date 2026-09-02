import { useMutation } from '@tanstack/react-query';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
import { loginRelaySocial } from '../../auth/services';

/**
 * Promotes relay authentication with a verified native provider token.
 */
export const useLoginRelaySocial = () =>
    useMutation({
        mutationFn: ({ body, provider }: { body: VerifyNativeTokenBody; provider?: string | null }) =>
            loginRelaySocial({
                body,
                provider: provider as never,
            }),
    });
