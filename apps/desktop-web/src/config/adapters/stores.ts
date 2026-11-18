import { readStorageEnvironment, resolveStorageStores } from '@chatic/runtime-web';
import type { StorageStores } from '@chatic/runtime-web';

/**
 * Every store this app keeps state in, chosen and built once for this environment: the session's secret
 * and plain ports, the desktop shell's vault (Electron `safeStorage`) once it says so in what it
 * injected, and the `device`/`tab` stores the app's own features and the runtime write through.
 *
 * Built when this module is first imported. That only builds objects: it reads what the shell injected
 * before the page ran and opens nothing, so it is safe this early. The late-vault mark is off: only
 * apps/web writes it, after its own mobile handshake; the desktop shell always injects its list.
 *
 * One set for the whole page, handed out from here — to the runtime's storage and cache adapters, to
 * `@chatic/config`'s ports, and by the entry point to `src/app/storage` — because where site data is
 * blocked each store is page memory, and a second set would hide the session from the features.
 */
export const desktopStores: StorageStores = resolveStorageStores({
    ...readStorageEnvironment(),
    lateVaultConfirmed: false,
});
