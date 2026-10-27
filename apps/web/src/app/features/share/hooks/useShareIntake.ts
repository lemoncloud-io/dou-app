import { useQuery } from '@tanstack/react-query';

import { fetchShareIntake, type ShareIntake } from '../../../bridge/shareIntake';

export type ShareIntakeState =
    | { status: 'loading' }
    | { status: 'ready'; intake: ShareIntake }
    /** No id, an app without share intake, or a share the app no longer holds. */
    | { status: 'empty' }
    /** A transient failure — a timeout or the bridge dropping. Worth a retry, not a silent exit. */
    | { status: 'error'; retry: () => void; retrying: boolean };

/**
 * The share behind the page's `?id=`. Read once per id and kept for the page's life: the answer is
 * the same until the page releases it, and a refetch on focus would only ask the app again for
 * copies it is already holding.
 */
export const useShareIntake = (id: string | null): ShareIntakeState => {
    const query = useQuery({
        queryKey: ['shareIntake', id],
        queryFn: () => fetchShareIntake(id as string),
        enabled: !!id,
        retry: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    if (!id) return { status: 'empty' };
    if (query.isPending) return { status: 'loading' };
    // A refetch keeps `isError` until it settles, so the retry has its own flag to show it is running.
    if (query.isError) return { status: 'error', retry: () => void query.refetch(), retrying: query.isFetching };
    return query.data ? { status: 'ready', intake: query.data } : { status: 'empty' };
};
