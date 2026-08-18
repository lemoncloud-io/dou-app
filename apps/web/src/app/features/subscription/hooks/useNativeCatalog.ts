import { useQuery } from '@tanstack/react-query';

import { isNative } from '@chatic/bridges';

import type { IapProductSubscription } from '@chatic/app-messages';

import { appBridge } from '../../../bridge';

/**
 * The store's own product catalog.
 *
 * Needed for the price. The server's `product.price` is a USD reference value, but what a plan card
 * must show is the store's localized, tax-inclusive price for this user's storefront — that only
 * exists on the store entry (`displayPrice`), and both stores require the displayed price to be
 * theirs. Off-native there is no store, so this stays empty and callers fall back.
 *
 * Fetched on mount rather than at purchase time (which is when `useTierPurchase` asks for it again,
 * through the same bridge call) because a price has to be on screen before the user decides.
 */
export const useNativeCatalog = () => {
    const enabled = isNative();

    const { data, isLoading } = useQuery({
        queryKey: ['nativeProducts'],
        queryFn: async (): Promise<IapProductSubscription[]> => {
            const { data: payload } = await appBridge.fetchProducts();
            return payload.products;
        },
        enabled,
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000,
    });

    return { nativeProducts: data ?? [], isLoading: enabled && isLoading };
};
