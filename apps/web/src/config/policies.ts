import type { RuntimeDeclaration, SessionOwnerChoice, WebHostFacts } from '@chatic/runtime-web';

import { SIGNED_OUT_KEY_PREFIXES } from '../app/runtime/signedOutKeys';

/**
 * A web declaration: resolved against the page's host facts, and handing back who holds the session
 * when its engine settled that (`web-hybrid`'s does; `web-browser`'s settles nothing).
 */
export type WebRuntimeDeclaration = RuntimeDeclaration<WebHostFacts, SessionOwnerChoice>;

/** What this app hands the runtime beyond its ports, the same in every host it runs in. */
export const webRuntimePolicies = {
    // The keys this app's log pipeline and telemetry policy write: a sign-out takes them.
    signedOutKeyPrefixes: SIGNED_OUT_KEY_PREFIXES,
    data: {
        repositories: {
            // The embedded `$site` of user.profile is persisted into the place cache only on the relay
            // scope, so a cloud partition never receives the default place row. It rides on the
            // runtime's own config, so it is in place before the data runtime is lazily created on the
            // first repository access.
            user: { persistEmbeddedSite: context => (context.cid ?? 'default') === 'default' },
        },
    },
} satisfies Pick<WebRuntimeDeclaration, 'signedOutKeyPrefixes' | 'data'>;
