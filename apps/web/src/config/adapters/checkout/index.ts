import { checkoutFromHost } from '@chatic/runtime-web';

import { hybridWebCheckout } from './shellWebCheckout';
import { storeCheckout } from './storeCheckout';
import { webCheckout } from './webCheckout';

export { hybridWebCheckout, isProductionBuild, shellHarness, shellWebCheckout } from './shellWebCheckout';
export type { ShellCheckoutRequest, ShellCheckoutScreen, ShellWebCheckout } from './shellWebCheckout';
export { storeCheckout } from './storeCheckout';
export { webCheckout } from './webCheckout';

export const checkoutAsDeclared = checkoutFromHost({ store: storeCheckout, web: webCheckout });

export const checkoutAsDeclaredInHybrid = checkoutFromHost({ store: storeCheckout, web: () => hybridWebCheckout() });
