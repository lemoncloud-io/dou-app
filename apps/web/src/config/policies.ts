import type { RuntimeDeclaration, SessionOwnerChoice, WebHostFacts } from '@chatic/runtime-web';

import { SIGNED_OUT_KEY_PREFIXES } from '../app/runtime/signedOutKeys';

export type WebRuntimeDeclaration = RuntimeDeclaration<WebHostFacts, SessionOwnerChoice>;

export const webRuntimePolicies = {
    signedOutKeyPrefixes: SIGNED_OUT_KEY_PREFIXES,
    data: {
        repositories: {
            user: { persistEmbeddedSite: context => (context.cid ?? 'default') === 'default' },
        },
    },
} satisfies Pick<WebRuntimeDeclaration, 'signedOutKeyPrefixes' | 'data'>;
