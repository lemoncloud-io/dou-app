import { BridgeStorageChannel, webClient } from '@chatic/bridges';
import { runtime } from '@chatic/runtime';
import { defineAdapter } from '@chatic/runtime-web';
import type { StorageStores, WebHostFacts } from '@chatic/runtime-web';

type Vault = NonNullable<StorageStores['vault']>;

/**
 * A vault the shell could not read at launch — on iOS, before the first unlock — becomes readable
 * later, and the shell reads it again when the app comes back to the foreground. This run already
 * fell back to the tab, so when the page is shown again and the vault now answers, the page starts
 * over on it.
 */
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

/**
 * `storage.resolved` — the session on the stores `resolveStorageStores()` chose for this page in
 * `main.tsx`: the device vault where the shell keeps one (or a late vault this tab already confirmed),
 * `localStorage` in a shell from before the vault, the tab's `sessionStorage` in a browser.
 *
 * Why not `@chatic/runtime-web`'s `storage.vault` / `storage.local` / `storage.tab`: each builds store
 * objects of its own, and this app's must be the very objects the entry handed to its features and to
 * config. Where site data is blocked those stores are page memory, and a second one would hide the
 * session from config's session lane and the cache's tab rows. `storage.vault` also does not read the
 * late-vault mark and drops what loading the vault answered, which the watch below needs.
 *
 * Loading the vault is what the entry did before booting: the vault is loaded — and anything left in
 * `localStorage` moved into it — before the runtime reads it synchronously. Not on a launch whose
 * session the shell owns (`sessionOwner: 'native'`): the vault is then the shell's alone, and the page
 * never opens it. Only a vault that could not be READ at launch is watched; one whose write failed later
 * reads fine and would reload the page on every return to the foreground.
 */
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
                if (outcome === 'unavailable' || outcome === 'unavailable-with-web-copy')
                    {watchUnavailableVault(vault, reload);}
            }
            return { secret: stores.secret, plain: stores.plain, device: stores.device };
        },
    });
