import { useCustomMutation } from '@chatic/shared';
import type { RegisterUserV2Body, UserView } from '@lemoncloud/chatic-backend-api';
import { registerUserV2 } from '../../api';

export const useRegisterUserV2 = () =>
    useCustomMutation<UserView, string, RegisterUserV2Body & { email?: boolean }>(
        ({ email, ...body }) => registerUserV2(body, email),
        {}
    );
