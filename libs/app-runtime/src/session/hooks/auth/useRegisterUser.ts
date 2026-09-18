import { useCustomMutation } from '@chatic/shared';
import type { UserBody } from '@lemoncloud/chatic-backend-api';
import type { DomainUser } from '@chatic/data';
import { logger } from '@chatic/bridges';
import { registerUser } from '../../auth/authActions';

// The return type changed from `UserView` to `DomainUser` — it now passes through the data layer and
// gets mapped to the domain shape. No caller reads the result (they only check registration success).
export const useRegisterUser = () =>
    useCustomMutation<DomainUser, string, UserBody>(registerUser, {
        onSuccess: () => {
            logger.info('AUTH', 'User registered successfully');
        },
    });
