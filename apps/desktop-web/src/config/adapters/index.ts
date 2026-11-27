import { runtime } from '@chatic/runtime-react';
import { defineAdapter, webLocalCachePorts } from '@chatic/runtime-hybrid-web';
import type { WebHostFacts } from '@chatic/runtime-hybrid-web';

import { desktopStores } from './stores';

export { createWebConfigPorts } from './configPorts';
export { desktopStores } from './stores';

export const storageDesktop = defineAdapter<'storage', WebHostFacts>({
    id: 'storage.desktop',
    port: 'storage',
    create: async () => {
        const { vault, secret, plain, device, webLocal, webSession } = desktopStores;
        if (vault) {
            await runtime.boot.prepareSecretStorage({
                vault,
                plain,
                web: webLocal,
                tab: webSession,
                afterLogout: new URLSearchParams(window.location.search).get('logout') === '1',
            });
        }
        return { secret, plain, device };
    },
});

export const cacheDesktopWebStorage = defineAdapter<'cache', WebHostFacts>({
    id: 'cache.desktop-web-storage',
    port: 'cache',
    create: () => webLocalCachePorts(desktopStores.webSession),
});
