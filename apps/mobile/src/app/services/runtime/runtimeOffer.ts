import '@chatic/runtime-mobile/polyfills';

import type { RuntimeOffer } from '@chatic/bridge-messages';
import { RUNTIME_CONTRACTS } from '@chatic/runtime-mobile';

export const nativeRuntimeOffer = (held: boolean): RuntimeOffer => ({
    sessionOwner: 'native',
    contracts: [...RUNTIME_CONTRACTS],
    ...(held && { held: true }),
});
