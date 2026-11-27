import { BridgeStorageChannel, webClient } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';
import { defineAdapter } from '@chatic/runtime-hybrid-web';
import type { StorageStores, WebHostFacts } from '@chatic/runtime-hybrid-web';

type Vault = NonNullable<StorageStores['vault']>;

export const watchUnavailableVault = (vault: Vault, reload: () => void = () => window.location.reload()): void => {
    const channel = new BridgeStorageChannel(webClient, 'nativeSecure');
    const onVisible = async () => {
        if (document.visibilityState !== 'visible' || vault.status === 'available') return;
        const read = await channel.read().catch(() => null);
        if (read?.status !== 'available') return;
        document.removeEventListener('visibilitychange', onVisible);
        reload();
    };
    document.addEventListener('visibilitychange', onVisible);
};

export const storageResolved = (stores: StorageStores, reload?: () => void) =>
    defineAdapter<'storage', WebHostFacts>({
        id: 'storage.resolved',
        port: 'storage',
        create: async ({ sessionOwner }) => {
            const { vault } = stores;
            if (vault && sessionOwner !== 'native') {
                const outcome = await runtime.boot.prepareSecretStorage({
                    vault,
                    plain: stores.plain,
                    web: stores.webLocal,
                    tab: stores.webSession,
                    afterLogout: new URLSearchParams(window.location.search).get('logout') === '1',
                });
                if (outcome === 'unavailable' || outcome === 'unavailable-with-web-copy') {
                    watchUnavailableVault(vault, reload);
                }
            }
            return { secret: stores.secret, plain: stores.plain, device: stores.device };
        },
    });
