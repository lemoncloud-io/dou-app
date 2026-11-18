import { checkoutFromHost } from '@chatic/runtime-web';

import { storeCheckout } from './storeCheckout';
import { webCheckout } from './webCheckout';

export { storeCheckout } from './storeCheckout';
export { webCheckout } from './webCheckout';

/**
 * `checkout.host` over this app's two ways of selling: the store the host sells through, over the phone
 * app's bridge, or a hand-off to the website — whichever the host declared first, or nothing.
 */
export const checkoutAsDeclared = checkoutFromHost({ store: storeCheckout, web: webCheckout });
