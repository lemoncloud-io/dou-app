import { checkoutFromHost } from '@chatic/runtime-hybrid-web';

import { hybridWebCheckout } from './shellWebCheckout';
import { storeCheckout } from './storeCheckout';
import { webCheckout } from './webCheckout';

export { hybridWebCheckout } from './shellWebCheckout';
export { storeCheckout } from './storeCheckout';
export { webCheckout } from './webCheckout';

export const checkoutAsDeclared = checkoutFromHost({ store: storeCheckout, web: webCheckout });

export const checkoutAsDeclaredInHybrid = checkoutFromHost({ store: storeCheckout, web: () => hybridWebCheckout() });
