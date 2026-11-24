import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { usePort } from '../lib/port';
import { subscriptionKeys } from './keys';

import type { SignInProvider } from '@chatic/web-checkout';

export const useSession = () => {
    const port = usePort();
    return useQuery({ queryKey: subscriptionKeys.session(), queryFn: () => port.getSession() });
};

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
