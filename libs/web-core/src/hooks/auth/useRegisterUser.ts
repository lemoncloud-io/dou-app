import { useCustomMutation } from '@chatic/shared';
import type { UserBody, UserView } from '@lemoncloud/chatic-backend-api';
import { logger } from '@chatic/bridges';
import { registerUser } from '../../api';

export const useRegisterUser = () =>
    useCustomMutation<UserView, string, UserBody>(registerUser, {
        onSuccess: () => {
            logger.info('AUTH', 'User registered successfully');
        },
    });
