import { useQueryClient } from '@tanstack/react-query';
import { useCustomMutation } from '@chatic/shared';
import { loginRelayUser } from '../../session';
import { cloudsKeys } from '../../api';
import type { LoginUserBody, UserTokenView } from '@lemoncloud/chatic-backend-api';

/**
 * Logs into relay using the generic relay login endpoint and hydrates session state.
 */
export const useLogin = () => {
    const queryClient = useQueryClient();
    return useCustomMutation<UserTokenView, string, LoginUserBody & { email?: boolean }>(
        ({ email, ...body }) => loginRelayUser({ body, email }),
        {
            onSuccess: () => {
                void queryClient.invalidateQueries({ queryKey: cloudsKeys.all });
            },
        }
    );
};
