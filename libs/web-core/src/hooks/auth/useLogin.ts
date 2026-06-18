import { useCustomMutation } from '@chatic/shared';
import { loginRelayUser } from '../../session';
import type { LoginUserBody, UserTokenView } from '@lemoncloud/chatic-backend-api';

/**
 * Logs into relay using the generic relay login endpoint and hydrates session state.
 */
export const useLogin = () => {
    return useCustomMutation<UserTokenView, string, LoginUserBody & { email?: boolean }>(({ email, ...body }) =>
        loginRelayUser({ body, email })
    );
};
