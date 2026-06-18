import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { refreshRelaySession, type RefreshRelaySessionOptions } from '../../../session/services';

/**
 * Refreshes the active relay session and optionally switches the active relay site.
 */
export const useRefreshRelaySession = () => {
    const mutation = useMutation({
        mutationFn: (options?: RefreshRelaySessionOptions) => refreshRelaySession(options),
    });

    return {
        refreshRelaySession: useCallback(
            (options?: RefreshRelaySessionOptions) => mutation.mutateAsync(options),
            [mutation]
        ),
        isRefreshingRelaySession: mutation.isPending,
    };
};
