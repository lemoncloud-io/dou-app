// First: the runtime's random source. This module is the first on a launch the app owns to load the
// runtime's package, whose libraries read it as they load.
import '@chatic/runtime-mobile/polyfills';

import type { RuntimeOffer } from '@chatic/bridge-messages';
import { RUNTIME_CONTRACTS } from '@chatic/runtime-mobile';

/**
 * The offer the shell injects on a launch its runtime owns: the session is the app's, under any of the
 * contracts this build's runtime speaks. A page that finds it says hello; the hello's answer is what
 * settles the owner for that page.
 *
 * `held` once the runtime holds the session in this process (`runtimeHold`): a page loaded after that
 * — a reload, or the WebView's content process starting over — must then ask even where its own
 * setting would not, or it would run a second session beside the runtime's.
 *
 * Loads the runtime's package, so it is required only on such a launch.
 */
export const nativeRuntimeOffer = (held: boolean): RuntimeOffer => ({
    sessionOwner: 'native',
    contracts: [...RUNTIME_CONTRACTS],
    ...(held && { held: true }),
});
