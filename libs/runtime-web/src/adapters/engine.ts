import type { EngineAdapter } from '@chatic/runtime-client';

import { createBridgedRuntime } from '../createBridgedRuntime';
import type { WebHostFacts } from '../hostFacts';
import { settleSessionOwner } from '../settleSessionOwner';
import type { SessionOwnerChoice, SessionOwnerOptions } from '../settleSessionOwner';

export interface EngineMirrorOptions extends Omit<SessionOwnerOptions, 'offer'> {
    /** Settles who owns the session; `settleSessionOwner` by default. A test seam. */
    settle?: (options: SessionOwnerOptions) => Promise<SessionOwnerChoice>;
}

/**
 * `engine.mirror` — a page that mirrors its phone shell's runtime when the shell takes the session, and
 * runs its own otherwise. What apps/web's entry point did by hand:
 *
 * - it settles who owns the session (`settleSessionOwner`) from the offer in the facts, before any
 *   port is built;
 * - `native` → the mirror engine over the bridge (`createBridgedRuntime`), and none of the page's
 *   ports is built: no stores, no sockets, no cache, and so no vault opened;
 * - `web` → the core engine over the ports the declaration chose, its storage told the page owns the
 *   session;
 * - unsettled → no engine at all: the shell may hold the session, and a page that ran its own would be
 *   a second owner. The entry point reads `owner` and says so.
 *
 * The settle is handed back as `owner` either way, so the entry point can do what is the app's around
 * it. `disabled` is the page's own switch to stop asking (apps/web's `VITE_SESSION_MIRROR_DISABLED`).
 * Any page: a page without an offer settles on `web` at once, without a word to the shell.
 */
export const engineMirror = ({ settle = settleSessionOwner, ...options }: EngineMirrorOptions = {}): EngineAdapter<
    WebHostFacts,
    SessionOwnerChoice
> => ({
    id: 'engine.mirror',
    port: 'engine',
    create: async ({ facts, core }) => {
        const owner = await settle({ ...options, offer: facts.runtimeOffer });
        switch (owner.sessionOwner) {
            case 'native':
                return { engine: createBridgedRuntime({ hello: owner.hello, port: owner.port }), owner };
            case 'web':
                return { engine: await core({ sessionOwner: 'web' }), owner };
            default:
                return { engine: null, owner };
        }
    },
});
