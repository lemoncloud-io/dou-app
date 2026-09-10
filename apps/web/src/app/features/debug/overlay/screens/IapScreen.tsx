import { useCallback, useEffect, useState } from 'react';

import type { IapProductSubscription } from '@chatic/app-messages';
import { webClient } from '@chatic/bridges';

import { useDebugOperation } from '../../hooks';
import { copyText } from '../../lib';
import { appBridge } from '../../../../bridge';

/**
 * In-app purchase plumbing — the app's IAP Test screen, moved here (ADR-0080 결정 11).
 *
 * All six commands already existed and the web's own `useSubscriptionIap` maps 1:1 onto them
 * (단계 1). What this screen adds over the product UI is the raw view: the store's answer verbatim,
 * so a mismatch between what Apple/Google returns and what the plan catalog expects is visible.
 *
 * **Buying is `post`, not `request`** — the result arrives later as `OnPurchaseSuccess` or
 * `OnPurchaseError`, which is why this subscribes rather than awaiting. Saying "구매됨" off the
 * `purchase` call alone would be a claim the bridge never made (결정 10).
 */
export const IapScreen = () => {
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
        const unsubSuccess = webClient.onEvent('OnPurchaseSuccess', record('성공'));
        const unsubError = webClient.onEvent('OnPurchaseError', record('실패'));
        return () => {
            unsubSuccess?.();
            unsubError?.();
        };
    }, []);

    return (
        <div className="flex flex-col gap-4 p-4">
            <div>
                <h1 className="text-[20px] font-semibold leading-[1.35]">인앱결제</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">스토어가 돌려준 값을 그대로 봅니다</p>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => void run('상품 조회', loadProducts)}
                    className="rounded-md border border-border px-2 py-1 text-xs"
                >
                    상품 조회
                </button>
                <button
                    type="button"
                    onClick={() => void run('구매 내역', () => appBridge.fetchCurrentPurchases())}
                    className="rounded-md border border-border px-2 py-1 text-xs"
                >
                    구매 내역
                </button>
                <button
                    type="button"
                    onClick={() => fire('스토어 열기', () => appBridge.openStore())}
                    className="rounded-md border border-border px-2 py-1 text-xs"
                >
                    스토어
                </button>
                <button
                    type="button"
                    onClick={() => fire('구독 관리', () => appBridge.openSubscriptionManagement())}
                    className="rounded-md border border-border px-2 py-1 text-xs"
                >
                    구독 관리
                </button>
            </div>

            {result && <p className="break-all font-mono text-[12px] text-muted-foreground">{result}</p>}

            <div className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-foreground">상품 ({products.length})</span>
                {products.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        상품이 없습니다 — 앱 셸과 스토어 계정이 있어야 조회됩니다
                    </p>
                ) : (
                    products.map(product => (
                        <div key={product.id} className="rounded-md bg-muted px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="break-all font-mono text-[12px] text-foreground">{product.id}</span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        fire(`구매 요청 ${product.id}`, () => appBridge.purchase({ id: product.id }))
                                    }
                                    className="shrink-0 rounded-md border border-border px-2 py-1 text-xs"
                                >
                                    구매
                                </button>
                            </div>
                            {/* Android needs an `offerToken` this screen does not guess at — the raw
                                JSON below is where the tester finds it. */}
                            <details className="mt-1">
                                <summary className="cursor-pointer text-[11px] text-muted-foreground">원문</summary>
                                <pre
                                    onClick={() => copyText(JSON.stringify(product, null, 2))}
                                    className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground"
                                >
                                    {JSON.stringify(product, null, 2)}
                                </pre>
                            </details>
                        </div>
                    ))
                )}
            </div>

            <div className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-foreground">구매 이벤트</span>
                {events.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        아직 없습니다 — 구매 결과는 요청의 응답이 아니라 이벤트로 옵니다
                    </p>
                ) : (
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-muted px-4 py-3 font-mono text-[12px] text-muted-foreground">
                        {events.join('\n')}
                    </pre>
                )}
            </div>
        </div>
    );
};
