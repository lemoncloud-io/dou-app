import { useCustomMutation } from '@chatic/shared';
import type { RegisterUserV2Body } from '@lemoncloud/chatic-backend-api';
import type { DomainUser } from '@chatic/data';
import { registerUserV2 } from '../../auth/authActions';

// See useRegisterUser for the return-type note — it becomes `DomainUser` via the data layer too.
export const useRegisterUserV2 = () =>
    useCustomMutation<DomainUser, string, RegisterUserV2Body & { email?: boolean }>(
        ({ email, ...body }) => registerUserV2(body, email),
        {}
    );
