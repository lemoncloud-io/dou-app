import { readWebHostFacts } from '@chatic/runtime-web';
import type { StorageStores, WebHostFacts } from '@chatic/runtime-web';

import type { WebRuntimeDeclaration } from './policies';
import { webBrowser } from './webBrowser';
import { webHybrid } from './webHybrid';

export type { WebRuntimeDeclaration } from './policies';

export type WebRuntimeName = 'web-browser' | 'web-hybrid';

export const chooseWebRuntime = (facts: Pick<WebHostFacts, 'bridge'>): WebRuntimeName =>
    facts.bridge === null ? 'web-browser' : 'web-hybrid';

export const declareWebRuntime = (
    stores: StorageStores,
    facts: Pick<WebHostFacts, 'bridge'> = readWebHostFacts()
): WebRuntimeDeclaration => (chooseWebRuntime(facts) === 'web-hybrid' ? webHybrid(stores) : webBrowser(stores));
