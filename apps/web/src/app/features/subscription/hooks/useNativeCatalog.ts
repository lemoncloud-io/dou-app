import { useQuery } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime-react';

import type { IapProductSubscription } from '@chatic/bridge-messages';

export const useNativeCatalog = () => {
    const checkout = runtime.checkout;
    const enabled = checkout.kind === 'store';

    const { data, isLoading } = useQuery({
        queryKey: ['nativeProducts'],
        queryFn: async (): Promise<IapProductSubscription[]> => (checkout.kind === 'store' ? checkout.products() : []),
        enabled,
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000,
    });

    return { nativeProducts: data ?? [], isLoading: enabled && isLoading };
};
