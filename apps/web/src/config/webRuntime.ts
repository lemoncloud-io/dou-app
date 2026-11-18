import { readWebHostFacts } from '@chatic/runtime-web';
import type { StorageStores, WebHostFacts } from '@chatic/runtime-web';

import type { WebRuntimeDeclaration } from './policies';
import { webBrowser } from './webBrowser';
import { webHybrid } from './webHybrid';

export type { WebRuntimeDeclaration } from './policies';

/** The two declarations apps/web boots from. */
export type WebRuntimeName = 'web-browser' | 'web-hybrid';

/**
 * Which declaration this page boots, picked once by the entry: `web-hybrid` when the host profile found
 * a shell's bridge at boot (the phone app's WebView, the virtual shell), `web-browser` when it found
 * none. It is the fact the page already told the two apart by — the stores chose `localStorage` or the
 * tab by it, and config wired the shell's lane by it — so a host is never read a second, different way.
 */
export const chooseWebRuntime = (facts: Pick<WebHostFacts, 'bridge'>): WebRuntimeName =>
    facts.bridge === null ? 'web-browser' : 'web-hybrid';

/**
 * The declaration for this page, over the stores the entry resolved — the same objects its features and
 * config are handed, so the session, config's session lane and the cache's tab rows share one store.
 */
export const declareWebRuntime = (
    stores: StorageStores,
    facts: Pick<WebHostFacts, 'bridge'> = readWebHostFacts()
): WebRuntimeDeclaration => (chooseWebRuntime(facts) === 'web-hybrid' ? webHybrid(stores) : webBrowser(stores));
