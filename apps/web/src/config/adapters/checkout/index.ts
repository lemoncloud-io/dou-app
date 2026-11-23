import { checkoutFromHost } from '@chatic/runtime-web';

import { storeCheckout } from './storeCheckout';
import { webCheckout } from './webCheckout';

export { storeCheckout } from './storeCheckout';
export { webCheckout } from './webCheckout';

export const checkoutAsDeclared = checkoutFromHost({ store: storeCheckout, web: webCheckout });
