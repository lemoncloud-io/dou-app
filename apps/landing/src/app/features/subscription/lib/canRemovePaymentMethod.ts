import { isLive } from './sceneOf';

import type { PaymentMethod, Subscription } from '../types';

/** Whether a card can be deleted, and if not, which refusal to show. */
export type RemovalCheck = 'ok' | 'default' | 'last';

/**
 * A live subscription always needs a card to charge, so the last card of its provider cannot go. Among
 * several, that provider's default cannot go either — another has to be made the default first, which
 * is the choice the refusal sends the reader to make. A card of the other provider charges nothing — though its default still waits for another to take its
 * place — and
 * with nothing to charge (no subscription, or an expired one) any card may be deleted, the last one
 * included.
 */
export const canRemovePaymentMethod = (
    pm: PaymentMethod,
    methods: PaymentMethod[],
    sub: Subscription | undefined
): RemovalCheck => {
    if (!isLive(sub) || sub?.provider !== pm.provider) {
        // The other provider's default still cannot go while that provider holds another card to make
        // the default first.
        const others = methods.filter(each => each.provider === pm.provider && each.id !== pm.id);
        return isLive(sub) && pm.isDefault && others.length > 0 ? 'default' : 'ok';
    }
    if (methods.filter(each => each.provider === pm.provider).length <= 1) return 'last';
    if (pm.isDefault) return 'default';
    return 'ok';
};
