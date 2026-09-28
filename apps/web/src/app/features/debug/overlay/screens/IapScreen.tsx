import { useCallback, useEffect, useState } from 'react';

import type { IapProductSubscription } from '@chatic/app-messages';
import { webClient } from '@chatic/bridges';

import { useDebugOperation } from '../../hooks';
import { CopyButton } from '../../components/CopyButton';
import { useIapScreenStrings } from '../../i18n/screens/IapScreen';
import { appBridge } from '../../../../bridge';

/**
 * In-app purchase plumbing — the app's IAP Test screen, moved here (ADR-0080 decision 11).
 *
 * All six commands already existed and the web's own `useSubscriptionIap` maps 1:1 onto them
 * (stage 1). What this screen adds over the product UI is the raw view: the store's answer
 * verbatim, so a mismatch between what Apple/Google returns and what the plan catalog expects is
 * visible.
 *
 * **Buying is `post`, not `request`** — the result arrives later as `OnPurchaseSuccess` or
 * `OnPurchaseError`, which is why this subscribes rather than awaiting. Saying "purchased" off the
 * `purchase` call alone would be a claim the bridge never made (decision 10).
 */
export const IapScreen = () => {
    const t = useIapScreenStrings();
    const { result, run, fire } = useDebugOperation();
    const [products, setProducts] = useState<IapProductSubscription[]>([]);
    const [events, setEvents] = useState<string[]>([]);

    const loadProducts = useCallback(async () => {
        const res = await appBridge.fetchProducts();
        setProducts(res.data?.products ?? []);
        return res;
    }, []);

    useEffect(() => {
        // The store call is slow and can fail outright (no shell, sandbox account trouble); the
        // buttons below let the tester retry, so a silent empty list is the right initial state.
        void loadProducts().catch(() => setProducts([]));
    }, [loadProducts]);

    useEffect(() => {
        const record = (label: string) => (message: unknown) =>
            setEvents(prev =>
                [
                    `${new Date().toLocaleTimeString()}  ${label} ${JSON.stringify(message)}`.slice(0, 300),
                    ...prev,
                ].slice(0, 20)
            );
        const unsubSuccess = webClient.onEvent('OnPurchaseSuccess', record(t.eventSuccess));
        const unsubError = webClient.onEvent('OnPurchaseError', record(t.eventFailure));
        return () => {
            unsubSuccess?.();
            unsubError?.();
        };
    }, [t.eventSuccess, t.eventFailure]);

    return (
        <div className="flex flex-col gap-4 p-4">
            <div>
                <h1 className="text-[20px] font-semibold leading-[1.35]">{t.title}</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">{t.subtitle}</p>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => void run(t.fetchProducts, loadProducts, 'FetchProducts')}
                    className="rounded-md border border-border px-2 py-1 text-xs"
                >
                    {t.fetchProducts}
                </button>
                <button
                    type="button"
                    onClick={() =>
                        void run(t.purchaseHistory, () => appBridge.fetchCurrentPurchases(), 'FetchCurrentPurchases')
                    }
                    className="rounded-md border border-border px-2 py-1 text-xs"
                >
                    {t.purchaseHistory}
                </button>
                <button
                    type="button"
                    onClick={() => fire(t.openStoreOperation, () => appBridge.openStore())}
                    className="rounded-md border border-border px-2 py-1 text-xs"
                >
                    {t.storeButton}
                </button>
                <button
                    type="button"
                    onClick={() => fire(t.manageSubscription, () => appBridge.openSubscriptionManagement())}
                    className="rounded-md border border-border px-2 py-1 text-xs"
                >
                    {t.manageSubscription}
                </button>
            </div>

            {result && <p className="break-all font-mono text-[12px] text-muted-foreground">{result}</p>}

            <div className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-foreground">{t.productsTitle(products.length)}</span>
                {products.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t.noProducts}</p>
                ) : (
                    products.map(product => (
                        <div key={product.id} className="rounded-md bg-muted px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="break-all font-mono text-[12px] text-foreground">{product.id}</span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        fire(t.purchaseRequest(product.id), () =>
                                            appBridge.purchase({ id: product.id })
                                        )
                                    }
                                    className="shrink-0 rounded-md border border-border px-2 py-1 text-xs"
                                >
                                    {t.buy}
                                </button>
                            </div>
                            {/* Android needs an `offerToken` this screen does not guess at — the raw
                                JSON below is where the tester finds it. */}
                            <details className="mt-1">
                                {/* The copy used to be an onClick on the <pre> itself — nothing said it
                                    was clickable, and it could not report the outcome. */}
                                <summary className="cursor-pointer text-[11px] text-muted-foreground">{t.raw}</summary>
                                <div className="mt-1 flex justify-end">
                                    <CopyButton value={() => JSON.stringify(product, null, 2)} />
                                </div>
                                <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
                                    {JSON.stringify(product, null, 2)}
                                </pre>
                            </details>
                        </div>
                    ))
                )}
            </div>

            <div className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-foreground">{t.purchaseEventsTitle}</span>
                {events.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t.noEvents}</p>
                ) : (
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-muted px-4 py-3 font-mono text-[12px] text-muted-foreground">
                        {events.join('\n')}
                    </pre>
                )}
            </div>
        </div>
    );
};
