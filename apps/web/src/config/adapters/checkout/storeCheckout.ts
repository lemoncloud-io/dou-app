import { webClient } from '@chatic/bridges';
import { mobileShellStoreCheckout } from '@chatic/host-web-mobile-shell';

export const storeCheckout = mobileShellStoreCheckout(webClient);
