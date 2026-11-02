import { useCustomMutation } from '@chatic/shared';
import type { RegisterUserV2Body } from '@lemoncloud/chatic-backend-api';
import type { DomainUser } from '@chatic/data';
import { registerUserV2 } from '@chatic/auth';

/**
 * `endpoint` registers on another stage's relay. Only the admin console's user screen sets it; left
 * out, the call goes to the session's own relay as before.
 */
export type RegisterUserV2Input = RegisterUserV2Body & { email?: boolean; endpoint?: string };

// See useRegisterUser for the return-type note — it becomes `DomainUser` via the data layer too.
export const useRegisterUserV2 = () =>
    useCustomMutation<DomainUser, string, RegisterUserV2Input>(
        ({ email, endpoint, ...body }) => registerUserV2(body, email, endpoint ? { endpoint } : undefined),
        {}
    );
