import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
    cloudsKeys,
    subscriptionKeys,
    useValidateApple,
    useValidateGoogle,
    useValidateMembership,
} from '@chatic/web-core';

import type { IapProductSubscription } from '@chatic/app-messages';
import { appBridge, useOnPurchaseError, useOnPurchaseSuccess } from '../../../bridge';
import { APP_ID, IS_DEV } from '../consts';
import type { NativePurchase, PurchaseError, PurchaseProduct } from '../types';

const iapLogger = {
    warn: (tag: string, msg: string, ...args: any[]) => console.warn(`[${tag}] ${msg}`, ...args),
};

export const useSubscriptionIap = () => {
    const isIOS = typeof window !== 'undefined' && window.CHATIC_APP_PLATFORM?.toLowerCase() === 'ios';
    const validateGoogle = useValidateGoogle();
    const validateApple = useValidateApple();
    const validateMembership = useValidateMembership();
    const queryClient = useQueryClient();

    // Purchase result arrives as push events, not a request-response pair.
    // A ref-based resolver bridges the push events back into a Promise for callers.
    const purchaseResolverRef = useRef<{
        resolve: (value: NativePurchase) => void;
        reject: (reason: PurchaseError) => void;
    } | null>(null);

    useOnPurchaseSuccess(message => {
        purchaseResolverRef.current?.resolve(message.data.purchase as NativePurchase);
        purchaseResolverRef.current = null;
    });

    useOnPurchaseError(message => {
        purchaseResolverRef.current?.reject(message.data.error);
        purchaseResolverRef.current = null;
    });

    const validate = useCallback(
        async (result: NativePurchase, email?: string) => {
            const validateFn = isIOS ? validateApple : validateGoogle;
            const response = await validateFn.mutateAsync({
                body: {
                    paymentType: isIOS ? 'apple-inapp' : 'google-inapp',
                    appId: APP_ID,
                    productId: result.productId,
                    purchaseToken: result.purchaseToken ?? '',
                    isSubscription: true,
                },
                params: { detail: 1 },
            });

            if (!response.isValid) {
                throw new Error('Validation failed: isValid=false');
            }

            await validateMembership.mutateAsync({
                body: {
                    appId: APP_ID,
                    paymentType: isIOS ? 'apple-inapp' : 'google-inapp',
                    purchaseToken: result.purchaseToken ?? '',
                    productId: result.productId,
                    ...(email && { email }),
                },
                ...(IS_DEV && { params: { dryRun: 1 } }),
            });

            return response;
        },
        [isIOS, validateApple, validateGoogle, validateMembership]
    );

    /** Fetch the native product catalog (used on Android to extract offerToken). */
    const fetchNativeProducts = useCallback(async (): Promise<IapProductSubscription[]> => {
        const { data } = await appBridge.fetchProducts();
        return data.products;
    }, []);

    /** Purchase → validate → finish transaction as a single atomic flow. */
    const purchaseAndValidate = useCallback(
        async (product: PurchaseProduct, email?: string) => {
            // Purchase result arrives via OnPurchaseSuccess / OnPurchaseError push events,
            // not as a request-response. Wrap in a Promise resolved by the useOn* handlers above.
            const result = await new Promise<NativePurchase>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    if (purchaseResolverRef.current) {
                        purchaseResolverRef.current.reject({ code: 'timeout', message: 'Purchase timed out' });
                        purchaseResolverRef.current = null;
                    }
                }, 60_000);

                purchaseResolverRef.current = {
                    resolve: value => {
                        clearTimeout(timeout);
                        resolve(value);
                    },
                    reject: reason => {
                        clearTimeout(timeout);
                        reject(reason);
                    },
                };

                appBridge.purchase({
                    id: product.id,
                    ...(!isIOS && { offerToken: product.offerToken, newPlanId: product.newPlanId }),
                });
            });

            await validate(result, email);
            await appBridge.finishPurchaseTransaction(result);

            // Fire-and-forget: notify native to refresh its purchase state
            void appBridge.fetchCurrentPurchases();

            // Allow native purchase state to propagate before invalidating queries
            await new Promise(resolve => setTimeout(resolve, 1500));
            await queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
            await queryClient.invalidateQueries({ queryKey: cloudsKeys.all });
        },
        [isIOS, validate, queryClient]
    );

    /** Restore purchases: validate + finish each existing purchase. */
    const restorePurchases = useCallback(async (): Promise<number> => {
        const {
            data: { purchases },
        } = await appBridge.fetchCurrentPurchases();
        let restored = 0;

        for (const p of purchases) {
            try {
                await validate(p);
                await appBridge.finishPurchaseTransaction(p);
                restored++;
            } catch (e) {
                iapLogger.warn('IAP', '[useSubscriptionIap] restore skip', { productId: p.productId, error: e });
            }
        }

        if (restored > 0) {
            void appBridge.fetchCurrentPurchases();
            await queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
        }

        return restored;
    }, [validate, queryClient]);

    return {
        fetchNativeProducts,
        purchaseAndValidate,
        restorePurchases,
    };
};
