import { useQuery } from '@tanstack/react-query';

import { fetchShareIntake, type ShareIntake } from '../../../bridge/shareIntake';

export type ShareIntakeState =
    | { status: 'loading' }
    | { status: 'ready'; intake: ShareIntake }
    | { status: 'empty' }
    | { status: 'error'; retry: () => void; retrying: boolean };

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
    if (query.isError) return { status: 'error', retry: () => void query.refetch(), retrying: query.isFetching };
    return query.data ? { status: 'ready', intake: query.data } : { status: 'empty' };
};
