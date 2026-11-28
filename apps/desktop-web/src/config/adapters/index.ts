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
        return { secret, plain, device, tab: webSession };
    },
});

export const cacheDesktopWebStorage = defineAdapter<'db', WebHostFacts>({
    id: 'db.desktop-web-storage',
    port: 'db',
    create: () => webLocalCachePorts(desktopStores.webSession),
});
