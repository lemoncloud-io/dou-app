import { isLive } from './sceneOf';

import type { PaymentMethod, Subscription } from '../types';

export type RemovalCheck = 'ok' | 'default' | 'last';

export const canRemovePaymentMethod = (
    pm: PaymentMethod,
    methods: PaymentMethod[],
    sub: Subscription | undefined
): RemovalCheck => {
    if (!isLive(sub) || sub?.provider !== pm.provider) {
        const others = methods.filter(each => each.provider === pm.provider && each.id !== pm.id);
        return isLive(sub) && pm.isDefault && others.length > 0 ? 'default' : 'ok';
    }
    if (methods.filter(each => each.provider === pm.provider).length <= 1) return 'last';
    if (pm.isDefault) return 'default';
    return 'ok';
};
