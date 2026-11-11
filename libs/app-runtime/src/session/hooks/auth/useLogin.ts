import { useQueryClient } from '@tanstack/react-query';
import { useCustomMutation } from '@chatic/shared';
import { relaySession, withoutToken } from '@chatic/auth';
import type { SessionAccountView } from '@chatic/auth';
import { cloudsKeys } from '../../../data/hooks/queryKeys';
import type { LoginUserBody } from '@lemoncloud/chatic-backend-api';

/**
 * Logs into relay using the generic relay login endpoint and hydrates session state.
 */
export const useLogin = () => {
    const queryClient = useQueryClient();
    // The answer is the account's fields: the token stays with the session.
    return useCustomMutation<SessionAccountView, string, LoginUserBody & { email?: boolean }>(
        async ({ email, ...body }) => withoutToken(await relaySession.loginUser({ body, email })),
        {
            onSuccess: () => {
                void queryClient.invalidateQueries({ queryKey: cloudsKeys.all });
            },
        }
    );
};
