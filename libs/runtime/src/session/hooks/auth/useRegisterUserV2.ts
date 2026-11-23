import { useCustomMutation } from '@chatic/shared';
import type { RegisterUserV2Body } from '@lemoncloud/chatic-backend-api';
import type { DomainUser } from '@chatic/runtime-client';
import { registerUserV2 } from '@chatic/runtime-client';

export type RegisterUserV2Input = RegisterUserV2Body & { email?: boolean; endpoint?: string };

export const useRegisterUserV2 = () =>
    useCustomMutation<DomainUser, string, RegisterUserV2Input>(
        ({ email, endpoint, ...body }) => registerUserV2(body, email, endpoint ? { endpoint } : undefined),
        {}
    );
