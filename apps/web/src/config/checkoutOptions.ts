import type { WebHostFacts } from '@chatic/runtime-hybrid-web';

import type { WebRuntimeDeclaration } from './policies';

export interface CheckoutOption {
    readonly id: string;
    readonly supported: boolean;
}

export const checkoutOptionsOf = (declaration: WebRuntimeDeclaration, facts: WebHostFacts): CheckoutOption[] => {
    const slot = declaration.host?.checkout;
    if (!slot) return [];
    return [slot.default, ...(slot.alternatives ?? [])].map(adapter => ({
        id: adapter.id,
        supported: adapter.supports?.(facts) ?? true,
    }));
};
