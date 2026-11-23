import { windowResultOf } from './windowReturn';

import type { PaymentWindow } from './createHttpPort';
import type { PaymentWindowHost, PaymentWindowPresenter } from '../standInWindow';

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
