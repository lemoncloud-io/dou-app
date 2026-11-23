import { legacyLemonKeyPrefix } from '@chatic/transport';

import type { KeyValueStore } from '@chatic/storage';

export const dropLemonLeftovers = (store: KeyValueStore): void => {
    const prefix = legacyLemonKeyPrefix();
    store
        .keys()
        .filter(key => key.startsWith(prefix))
        .forEach(key => store.remove(key));
};
