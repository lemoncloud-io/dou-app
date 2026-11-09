import { lemonKeyPrefix } from '@chatic/transport';

import type { KeyValueStore } from '@chatic/storage';

const LANGUAGE_SUFFIX = '.i18nextLng';

/**
 * Deletes lemon-web-core's old credential bundle from `store`, keeping the language key that shares
 * its prefix. lemon keeps its credentials in memory now; a bundle in web storage is left from a build
 * before that. A browser runs this on every boot (there is no vault to move to), a shell as part of the
 * move above.
 */
export const dropLemonLeftovers = (store: KeyValueStore): void => {
    const prefix = lemonKeyPrefix();
    store
        .keys()
        .filter(key => key.startsWith(prefix) && !key.endsWith(LANGUAGE_SUFFIX))
        .forEach(key => store.remove(key));
};
