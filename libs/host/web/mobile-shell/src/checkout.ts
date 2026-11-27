import { logger } from '@chatic/bridges';
import type { StoreCheckout, StoreName, StorePurchase, StorePurchaseError } from '@chatic/ports';

import type { ShellBridge } from './bridge';

export const PURCHASE_TIMEOUT_MS = 60_000;

export const FETCH_PRODUCTS_TIMEOUT_MS = 10_000;

export const mobileShellStoreCheckout =
    (bridge: ShellBridge) =>
    (store: StoreName): StoreCheckout => {
        type Waiting = { resolve: (purchase: StorePurchase) => void; reject: (error: StorePurchaseError) => void };
        let waiting: Waiting | null = null;

        bridge.onEvent('OnPurchaseSuccess', message => {
            const purchase = message.data.purchase as StorePurchase;
            logger.info('IAP', 'native purchase success received', { productId: purchase?.productId });
            waiting?.resolve(purchase);
            waiting = null;
        });

        bridge.onEvent('OnPurchaseError', message => {
            const code = message.data.error?.code;
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
            products: async () =>
                (await bridge.request({ type: 'FetchProducts', data: {} }, { timeoutMs: FETCH_PRODUCTS_TIMEOUT_MS }))
                    .data.products,
            purchase: request =>
                new Promise<StorePurchase>((resolve, reject) => {
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

                    bridge.post({
                        type: 'Purchase',
                        data: {
                            id: request.id,
                            ...(store === 'google' && {
                                offerToken: request.offerToken,
                                newPlanId: request.newPlanId,
                                ...(request.oldPlanId && { oldPlanId: request.oldPlanId }),
                            }),
                        },
                    });
                }),
            finish: async purchase => {
                await bridge.request({ type: 'FinishPurchaseTransaction', data: { purchase } });
            },
            currentPurchases: async () =>
                (await bridge.request({ type: 'FetchCurrentPurchases', data: {} })).data.purchases,
            openManagement: () => bridge.post({ type: 'OpenSubscriptionManagement', data: {} }),
        };
    };
