import { useMutation } from '@tanstack/react-query';

import { type LogoutOptions, logoutRelaySession } from '../../../session';

/**
 * Terminates the active relay session.
 */
export const useLogoutRelaySession = () =>
    useMutation({
        mutationFn: (options?: LogoutOptions) => logoutRelaySession(options),
    });
