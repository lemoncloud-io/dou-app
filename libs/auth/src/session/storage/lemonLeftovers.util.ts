import { legacyLemonKeyPrefix } from '@chatic/transport';

import type { KeyValueStore } from '@chatic/storage';

/**
 * Deletes lemon-web-core's old credential bundle from `store`, and the language key that shares its
 * prefix — that key only fed lemon's language header, and nothing reads or writes it any more. Nothing writes there any more — requests are signed from the session's relay token — so
 * a bundle in web storage is left from an older build. A browser runs this on every boot (there is no
 * vault to move to), a shell as part of the vault move.
 */
export const dropLemonLeftovers = (store: KeyValueStore): void => {
    const prefix = legacyLemonKeyPrefix();
    store
        .keys()
        .filter(key => key.startsWith(prefix))
        .forEach(key => store.remove(key));
};
