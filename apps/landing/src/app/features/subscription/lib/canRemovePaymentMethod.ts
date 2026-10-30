import { isLive } from './sceneOf';

import type { PaymentMethod, Subscription } from '../types';

/** Whether a card can be deleted, and if not, which refusal to show. */
export type RemovalCheck = 'ok' | 'default' | 'last';

/**
 * A live subscription always needs a card to charge, so the last card of its provider cannot go. Among
 * several, that provider's default cannot go either — another has to be made the default first, which
 * is the choice the refusal sends the reader to make. A card of the other provider charges nothing, and
 * with nothing to charge (no subscription, or an expired one) any card may be deleted, the last one
 * included.
 */
export const canRemovePaymentMethod = (
    pm: PaymentMethod,
    methods: PaymentMethod[],
    sub: Subscription | undefined
): RemovalCheck => {
    if (!isLive(sub) || sub?.provider !== pm.provider) return 'ok';
    if (methods.filter(each => each.provider === pm.provider).length <= 1) return 'last';
    if (pm.isDefault) return 'default';
    return 'ok';
};
