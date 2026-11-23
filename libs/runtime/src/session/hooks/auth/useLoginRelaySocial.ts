import { useMutation } from '@tanstack/react-query';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
import { sessionCommands } from '@chatic/runtime-client';

export const useLoginRelaySocial = () =>
    useMutation({
        mutationFn: ({ body, provider }: { body: VerifyNativeTokenBody; provider?: string | null }) =>
            sessionCommands().loginBySocialToken(body, provider),
    });
