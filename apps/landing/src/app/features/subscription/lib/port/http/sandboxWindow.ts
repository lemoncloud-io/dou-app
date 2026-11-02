import { windowResultOf } from './windowReturn';

import type { PaymentWindow } from './createHttpPort';
import type { PaymentWindowHost, PaymentWindowPresenter } from '../standInWindow';

/**
 * The card window of sandbox payments. The payment server's mock provider takes any card token and
 * answers `issue` with fake window values (`storeId: 'mock'`, `clientSecret: 'mock'`) that no real
 * provider window could open with, so neither provider's SDK is called: the stand-in window
 * (`MockPaymentWindow`, registered through `host`) asks the reader how the window ends, and a
 * registered card is a made-up token the server's mock provider accepts. The outcome is read by the
 * same function as a real window's (`windowResultOf`), so the checkout cannot tell the difference.
 *
 * Without a stand-in window mounted the window ends closed, as a real one the reader dismissed would.
 */
export const createSandboxWindow = (
    token: () => string = () => `sandbox-${Math.random().toString(36).slice(2, 12)}`
): { host: PaymentWindowHost; paymentWindow: PaymentWindow } => {
    let presenter: PaymentWindowPresenter | null = null;
    return {
        host: {
            setPaymentWindow: next => {
                presenter = next;
            },
        },
        paymentWindow: async ({ purpose, planId }) => {
            if (!presenter) return { outcome: 'closed' };
            const outcome = await presenter({ purpose, planId, suggested: 'registered' });
            if (outcome === 'registered') return windowResultOf({ billingKey: token() });
            if (outcome === 'failed') return windowResultOf({ code: 'SANDBOX_DECLINED', message: 'declined' });
            return windowResultOf(undefined);
        },
    };
};
