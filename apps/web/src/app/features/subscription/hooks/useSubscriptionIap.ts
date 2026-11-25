import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { runtime, type StoreCheckout } from '@chatic/runtime-react';
import { subscriptionKeys } from '../../../hooks/queryKeys';
import { useValidateMembership } from '../../../hooks/useMembership';

import type { IapProductSubscription } from '@chatic/bridge-messages';
import { logger } from '@chatic/bridges';
import { useLinkedAccounts } from '../../../hooks';
import { APP_ID } from '../consts';
import { asWebSubscriptionActive, isWebSubscriptionActiveError } from '../lib/webSubscriptionActive';
import type { NativePurchase, PurchaseProduct } from '../types';

const storeCheckout = (): StoreCheckout => {
    const checkout = runtime.checkout;
    if (checkout.kind !== 'store') throw new Error(`no store sells on this host (checkout: ${checkout.kind})`);
    return checkout;
};

export const useSubscriptionIap = () => {
    const { t } = useTranslation();
    const validateMembership = useValidateMembership();
    const queryClient = useQueryClient();
    const linked = useLinkedAccounts();
    const { isGuest } = runtime.session.useRuntimeProfile();

    const isMissingSocialForCloud = linked.social === 'absent';

    const validate = useCallback(
        async (result: NativePurchase, email?: string) => {
            const membership = await validateMembership
                .mutateAsync({
                    body: {
                        appId: APP_ID,
                        paymentType: storeCheckout().store === 'apple' ? 'apple-inapp' : 'google-inapp',
                        purchaseToken: result.purchaseToken ?? '',
                        productId: result.productId,
                        ...(email && { email }),
                    },
                })
                .catch((e: unknown) => {
                    const webActive = asWebSubscriptionActive(e);
                    if (webActive) {
                        logger.warn('IAP', 'store receipt refused: web subscription is active', {
                            data: { productId: result.productId },
                        });
                        throw webActive;
                    }
                    throw e;
                });

            if (!membership.isValid) {
                logger.error('IAP', 'membership validation rejected receipt (isValid=false)', {
                    data: { productId: result.productId },
                });
                throw new Error('Validation failed: isValid=false');
            }

            return membership;
        },
        [validateMembership]
    );

    const fetchNativeProducts = useCallback(
        async (): Promise<IapProductSubscription[]> => storeCheckout().products(),
        []
    );

    const purchaseAndValidate = useCallback(
        async (product: PurchaseProduct, email?: string) => {
            if (isGuest) {
                logger.warn('IAP', 'purchase refused before store', { reason: 'guest' });
                throw new Error(t('mypage.subscription.loginRequired'));
            }
            if (isMissingSocialForCloud) {
                logger.warn('IAP', 'purchase refused before store', { reason: 'social-link-missing' });
                throw new Error(t('mypage.subscription.socialLinkRequired'));
            }
            logger.info('IAP', 'purchase started', { productId: product.id });
            const store = storeCheckout();
            const result = await store.purchase(product);

            const membership = await validate(result, email);
            try {
                await store.finish(result);
            } catch (error) {
                logger.error('IAP', 'finish purchase transaction failed', {
                    error,
                    data: { productId: result.productId },
                });
                throw error;
            }

            void store.currentPurchases();

            await new Promise(resolve => setTimeout(resolve, 1500));
            await queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
            await queryClient.invalidateQueries({ queryKey: runtime.data.cloudsKeys.all });
            logger.info('IAP', 'purchase completed', { productId: product.id });
            return membership;
        },
        [validate, queryClient, isGuest, isMissingSocialForCloud, t]
    );

    const restorePurchases = useCallback(async (): Promise<number> => {
        const store = storeCheckout();
        const purchases = await store.currentPurchases();
        let restored = 0;
        let webActive: unknown;

        for (const p of purchases) {
            try {
                await validate(p);
                await store.finish(p);
                restored++;
            } catch (e) {
                if (isWebSubscriptionActiveError(e)) {
                    webActive = e;
                    break;
                }
                logger.warn('IAP', '[useSubscriptionIap] restore skip', { productId: p.productId, error: e });
            }
        }

        if (restored > 0) {
            void store.currentPurchases();
            await queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
        }

        if (webActive) throw webActive;
        return restored;
    }, [validate, queryClient]);

    return {
        fetchNativeProducts,
        purchaseAndValidate,
        restorePurchases,
        isMissingSocialForCloud,
    };
};
