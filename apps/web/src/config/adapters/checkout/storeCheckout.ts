import { logger, webClient } from '@chatic/bridges';

import type { StoreCheckout, StoreName, StorePurchase, StorePurchaseError } from '@chatic/runtime-web';

import { appBridge } from '../../../app/bridge/appBridge';

/** How long a purchase sheet may stay open before the purchase is given up as `timeout`. */
export const PURCHASE_TIMEOUT_MS = 60_000;

/**
 * An app store, reached through the phone app's bridge.
 *
 * A purchase's result does not come back as the reply to `Purchase`: the shell pushes it later, as
 * `OnPurchaseSuccess` or `OnPurchaseError`. Those two are listened to for as long as the port lives
 * — from the entry point on — and settle whichever purchase is waiting. One purchase is waiting at a
 * time; starting another replaces it, as a store sheet does, and the one it replaces is rejected as
 * `superseded` rather than left hanging.
 */
export const storeCheckout = (store: StoreName): StoreCheckout => {
    type Waiting = { resolve: (purchase: StorePurchase) => void; reject: (error: StorePurchaseError) => void };
    let waiting: Waiting | null = null;

    webClient.onEvent('OnPurchaseSuccess', message => {
        const purchase = message.data.purchase as StorePurchase;
        logger.info('IAP', 'native purchase success received', { productId: purchase?.productId });
        waiting?.resolve(purchase);
        waiting = null;
    });

    // Every store failure passes through here, so this is the one place worth logging them.
    webClient.onEvent('OnPurchaseError', message => {
        const code = message.data.error?.code;
        // A cancellation is an ordinary outcome, not a failure: filing it as `error` would misread the
        // funnel and advance the upload flush for nothing.
        if (code === 'user-cancelled') {
            logger.info('IAP', 'native purchase cancelled by user');
        } else {
            logger.error('IAP', `native purchase failed (code=${code ?? '-'})`, { data: { code } });
        }
        waiting?.reject(message.data.error);
        waiting = null;
    });

    return {
        kind: 'store',
        store,
        products: async () => (await appBridge.fetchProducts()).data.products,
        purchase: request =>
            new Promise<StorePurchase>((resolve, reject) => {
                // This purchase's own entry: its timer settles it and nothing else, even after a later
                // purchase has taken its place.
                const timeout = setTimeout(() => {
                    if (waiting !== entry) return;
                    logger.error('IAP', 'purchase timed out after 60s', { data: { productId: request.id } });
                    waiting = null;
                    entry.reject({ code: 'timeout', message: 'Purchase timed out' });
                }, PURCHASE_TIMEOUT_MS);

                const entry: Waiting = {
                    resolve: value => {
                        clearTimeout(timeout);
                        resolve(value);
                    },
                    reject: reason => {
                        clearTimeout(timeout);
                        reject(reason);
                    },
                };
                waiting?.reject({ code: 'superseded', message: 'Another purchase started' });
                waiting = entry;

                appBridge.purchase({
                    id: request.id,
                    ...(store === 'google' && {
                        offerToken: request.offerToken,
                        newPlanId: request.newPlanId,
                        // Android reads the replacement mode from old-vs-new plan rank. Omit this on
                        // a tier change and the store books a brand-new subscription instead.
                        ...(request.oldPlanId && { oldPlanId: request.oldPlanId }),
                    }),
                });
            }),
        finish: async purchase => {
            await appBridge.finishPurchaseTransaction(purchase);
        },
        currentPurchases: async () => (await appBridge.fetchCurrentPurchases()).data.purchases,
        openManagement: () => appBridge.openSubscriptionManagement(),
    };
};
