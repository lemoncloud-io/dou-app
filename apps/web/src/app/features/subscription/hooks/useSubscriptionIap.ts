import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { cloudsKeys } from '@chatic/app-runtime';
import { subscriptionKeys } from '../../../hooks/queryKeys';
import { useValidateMembership } from '../../../hooks/useMembership';

import type { IapProductSubscription } from '@chatic/app-messages';
import { useRuntimeProfile } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { appBridge, useOnPurchaseError, useOnPurchaseSuccess } from '../../../bridge';
import { useLinkedAccounts } from '../../../hooks';
import { APP_ID } from '../consts';
import type { NativePurchase, PurchaseError, PurchaseProduct } from '../types';

export const useSubscriptionIap = () => {
    const isIOS = typeof window !== 'undefined' && window.CHATIC_APP_PLATFORM?.toLowerCase() === 'ios';
    const { t } = useTranslation();
    const validateMembership = useValidateMembership();
    const queryClient = useQueryClient();
    const linked = useLinkedAccounts();
    const { isGuest } = useRuntimeProfile();

    /**
     * A subscription attaches to a cloud, and owning a cloud is social-account based — so a user with
     * no social credential has nothing for the membership to land on. Refuse BEFORE the store charge
     * rather than after: `validateMembership` runs post-purchase, so failing there would take the money
     * and leave the subscription unattached.
     *
     * Only a definite `'absent'` blocks. `'unknown'` means the profile has not landed or the server
     * never built the `link$` slot (the one-time backfill for pre-existing accounts) — reading that as
     * "no social" would stop paying customers from renewing, which is far worse than letting the server
     * be the one to refuse (ADR-0042 §5).
     */
    const isMissingSocialForCloud = linked.social === 'absent';

    // Purchase result arrives as push events, not a request-response pair.
    // A ref-based resolver bridges the push events back into a Promise for callers.
    const purchaseResolverRef = useRef<{
        resolve: (value: NativePurchase) => void;
        reject: (reason: PurchaseError) => void;
    } | null>(null);

    useOnPurchaseSuccess(message => {
        const purchase = message.data.purchase as NativePurchase;
        logger.info('IAP', 'native purchase success received', { productId: purchase?.productId });
        purchaseResolverRef.current?.resolve(purchase);
        purchaseResolverRef.current = null;
    });

    // Every store failure passes through here, so this is the one place worth logging them — the
    // screens that call `purchaseAndValidate` do not need their own error line.
    useOnPurchaseError(message => {
        const code = message.data.error?.code;
        // A cancellation is an ordinary outcome, not a failure: filing it as `error` would misread the
        // funnel and advance the upload flush for nothing.
        if (code === 'user-cancelled') {
            logger.info('IAP', 'native purchase cancelled by user');
        } else {
            logger.error('IAP', `native purchase failed (code=${code ?? '-'})`, { data: { code } });
        }
        purchaseResolverRef.current?.reject(message.data.error);
        purchaseResolverRef.current = null;
    });

    // The receipt is only ever validated server-side: `POST /memberships/0` validates against
    // Apple/Google itself (backend-api → iap-api) before creating/renewing the membership. Calling
    // iap-api's `/validate/<platform>` directly from the client was dead weight — that route was
    // never meant to be reachable by a client credential, only by backend-api's own.
    const validate = useCallback(
        async (result: NativePurchase, email?: string) => {
            const membership = await validateMembership.mutateAsync({
                body: {
                    appId: APP_ID,
                    paymentType: isIOS ? 'apple-inapp' : 'google-inapp',
                    purchaseToken: result.purchaseToken ?? '',
                    productId: result.productId,
                    ...(email && { email }),
                },
            });

            if (!membership.isValid) {
                // Charged by the store but the membership never attaches — the "paid and got nothing"
                // case. The receipt itself is never logged.
                logger.error('IAP', 'membership validation rejected receipt (isValid=false)', {
                    data: { productId: result.productId },
                });
                throw new Error('Validation failed: isValid=false');
            }

            return membership;
        },
        [isIOS, validateMembership]
    );

    /** Fetch the native product catalog (used on Android to extract offerToken). */
    const fetchNativeProducts = useCallback(async (): Promise<IapProductSubscription[]> => {
        const { data } = await appBridge.fetchProducts();
        return data.products;
    }, []);

    /** Purchase → validate → finish transaction as a single atomic flow. */
    const purchaseAndValidate = useCallback(
        async (product: PurchaseProduct, email?: string) => {
            // Cheapest refusal first — before the store is even opened. Both entry points surface a
            // thrown message straight to the user, so this reads as guidance rather than a failure.
            //
            // A guest is refused ahead of the social check: it is the same missing credential, but
            // "log in" is the actionable instruction, whereas `socialLinkRequired` points at a MyPage
            // linking screen a guest cannot use. This is only a backstop — both entry points send a
            // guest to login before the email step, so reaching here means a gate was bypassed.
            if (isGuest) {
                logger.warn('IAP', 'purchase refused before store', { reason: 'guest' });
                throw new Error(t('mypage.subscription.loginRequired'));
            }
            if (isMissingSocialForCloud) {
                logger.warn('IAP', 'purchase refused before store', { reason: 'social-link-missing' });
                throw new Error(t('mypage.subscription.socialLinkRequired'));
            }
            // Purchase result arrives via OnPurchaseSuccess / OnPurchaseError push events,
            // not as a request-response. Wrap in a Promise resolved by the useOn* handlers above.
            logger.info('IAP', 'purchase started', { productId: product.id });
            const result = await new Promise<NativePurchase>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    if (purchaseResolverRef.current) {
                        logger.error('IAP', 'purchase timed out after 60s', { data: { productId: product.id } });
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
                    ...(!isIOS && {
                        offerToken: product.offerToken,
                        newPlanId: product.newPlanId,
                        // Android reads the replacement mode from old-vs-new plan rank. Omit this on
                        // a tier change and the store books a brand-new subscription instead.
                        ...(product.oldPlanId && { oldPlanId: product.oldPlanId }),
                    }),
                });
            });

            await validate(result, email);
            try {
                await appBridge.finishPurchaseTransaction(result);
            } catch (error) {
                // An unfinished transaction is re-presented by the store, so this failure is what
                // turns into a second charge for a purchase that already validated.
                logger.error('IAP', 'finish purchase transaction failed', {
                    error,
                    data: { productId: result.productId },
                });
                throw error;
            }

            // Fire-and-forget: notify native to refresh its purchase state
            void appBridge.fetchCurrentPurchases();

            // Allow native purchase state to propagate before invalidating queries
            await new Promise(resolve => setTimeout(resolve, 1500));
            await queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
            await queryClient.invalidateQueries({ queryKey: cloudsKeys.all });
            logger.info('IAP', 'purchase completed', { productId: product.id });
        },
        [isIOS, validate, queryClient, isGuest, isMissingSocialForCloud, t]
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
                logger.warn('IAP', '[useSubscriptionIap] restore skip', { productId: p.productId, error: e });
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
        // Deliberately NOT gated: restoring is recovery, and a purchase that already exists belongs to
        // someone. Each one is validated server-side and skipped on failure, so the worst case is a
        // count of 0 — whereas refusing to even try would strand a paying user.
        restorePurchases,
        /** Lets a screen guide toward linking BEFORE offering to charge. See `isMissingSocialForCloud`. */
        isMissingSocialForCloud,
    };
};
