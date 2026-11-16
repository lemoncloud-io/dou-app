import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';
import { subscriptionKeys } from '../../../hooks/queryKeys';
import { useValidateMembership } from '../../../hooks/useMembership';

import type { IapProductSubscription } from '@chatic/bridge-messages';
import { logger } from '@chatic/bridges';
import { host, type StoreCheckout } from '@chatic/host';
import { useLinkedAccounts } from '../../../hooks';
import { APP_ID } from '../consts';
import type { NativePurchase, PurchaseProduct } from '../types';

/**
 * The store this host sells through. Only a store's screens call the store, so a host without one
 * gets a plain refusal here rather than a bridge request that would wait out its timeout for a shell
 * that is not there.
 */
const storeCheckout = (): StoreCheckout => {
    const checkout = host.ports.checkout;
    if (checkout.kind !== 'store') throw new Error(`no store sells on this host (checkout: ${checkout.kind})`);
    return checkout;
};

export const useSubscriptionIap = () => {
    const { t } = useTranslation();
    const validateMembership = useValidateMembership();
    const queryClient = useQueryClient();
    const linked = useLinkedAccounts();
    const { isGuest } = runtime.session.useRuntimeProfile();

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

    // The receipt is only ever validated server-side: `POST /memberships/0` validates against
    // Apple/Google itself (backend-api → iap-api) before creating/renewing the membership. Calling
    // iap-api's `/validate/<platform>` directly from the client was dead weight — that route was
    // never meant to be reachable by a client credential, only by backend-api's own.
    const validate = useCallback(
        async (result: NativePurchase, email?: string) => {
            const membership = await validateMembership.mutateAsync({
                body: {
                    appId: APP_ID,
                    paymentType: storeCheckout().store === 'apple' ? 'apple-inapp' : 'google-inapp',
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
        [validateMembership]
    );

    /** Fetch the native product catalog (used on Android to extract offerToken). */
    const fetchNativeProducts = useCallback(
        async (): Promise<IapProductSubscription[]> => storeCheckout().products(),
        []
    );

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
            // The store's sheet; the port settles it from the shell's purchase events, with a timeout.
            logger.info('IAP', 'purchase started', { productId: product.id });
            const store = storeCheckout();
            const result = await store.purchase(product);

            const membership = await validate(result, email);
            try {
                await store.finish(result);
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
            void store.currentPurchases();

            // Allow native purchase state to propagate before invalidating queries
            await new Promise(resolve => setTimeout(resolve, 1500));
            await queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
            await queryClient.invalidateQueries({ queryKey: runtime.data.cloudsKeys.all });
            logger.info('IAP', 'purchase completed', { productId: product.id });
            // Handed back so the caller can show what was bought without waiting on the refetch above —
            // the confirmation screen draws straight from the membership the relay just validated.
            return membership;
        },
        [validate, queryClient, isGuest, isMissingSocialForCloud, t]
    );

    /** Restore purchases: validate + finish each existing purchase. */
    const restorePurchases = useCallback(async (): Promise<number> => {
        const store = storeCheckout();
        const purchases = await store.currentPurchases();
        let restored = 0;

        for (const p of purchases) {
            try {
                await validate(p);
                await store.finish(p);
                restored++;
            } catch (e) {
                logger.warn('IAP', '[useSubscriptionIap] restore skip', { productId: p.productId, error: e });
            }
        }

        if (restored > 0) {
            void store.currentPurchases();
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
