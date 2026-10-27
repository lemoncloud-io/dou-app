import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { usePort } from '../lib/port';
import { subscriptionKeys } from './keys';

import type { SignInProvider } from '../types';

export const useSession = () => {
    const port = usePort();
    return useQuery({ queryKey: subscriptionKeys.session(), queryFn: () => port.getSession() });
};

/** Resolves with the provider's address; the caller leaves for it. */
export const useStartSignIn = () => {
    const port = usePort();
    return useMutation({
        mutationFn: (input: { provider: SignInProvider; next?: string }) => port.startSignIn(input),
    });
};

export const useCompleteSignIn = () => {
    const port = usePort();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (callback: URLSearchParams) => port.completeSignIn(callback),
        // A different account may have signed in: nothing cached for the last one still holds.
        onSuccess: async () => {
            queryClient.removeQueries({ queryKey: subscriptionKeys.all });
        },
    });
};

export const useSignOut = () => {
    const port = usePort();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => port.signOut(),
        onSuccess: () => {
            queryClient.removeQueries({ queryKey: subscriptionKeys.all });
            queryClient.setQueryData(subscriptionKeys.session(), null);
        },
    });
};
