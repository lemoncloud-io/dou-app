import { getDynamicRelayBackend, getDynamicRelayWss } from '@chatic/web-config';

import { configureRelayEndpoints } from './relayStore';

/**
 * The one place `session/store` is wired to env — kept OUT of the store files themselves so the
 * passivity rule (ADR-0070 결정 1 규칙 1) holds as written: `store/**` imports no env, no transport,
 * no sibling folder. This module is the seam, and it is the only file under `store/` exempt from the
 * `@chatic/web-config` ban.
 *
 * Called by [`initAppRuntime`](../../init.ts), not by loading the session barrel. It used to run at
 * barrel load so resolvers existed the moment anything touched the session surface; the explicit boot
 * ADR-0070 5단계 named now owns it, which is what makes the boot visible in each app's entry point.
 *
 * Resolvers are passed as functions, not values: relay backend/wss are read lazily on every access so
 * a deeplink override (`?_backend=`) captured after module load still takes effect.
 */
export const configureSessionStore = (): void => {
    configureRelayEndpoints({ backend: getDynamicRelayBackend, wss: getDynamicRelayWss });
};
