import { useCustomMutation } from '@chatic/shared';
import type { UserBody } from '@lemoncloud/chatic-backend-api';
import type { DomainUser } from '@chatic/runtime-client';
import { logger } from '@chatic/bridges';
import { registerUser } from '@chatic/runtime-client';

export const useRegisterUser = () =>
    useCustomMutation<DomainUser, string, UserBody>(registerUser, {
        onSuccess: () => {
            logger.info('AUTH', 'User registered successfully');
        },
    });
