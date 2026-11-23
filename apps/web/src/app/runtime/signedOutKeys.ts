import type { KeyValueStore } from '@chatic/storage';

import { LOG_KEY_PREFIX } from './logging/logUploadStore';
import { TELEMETRY_POLICY_KEY_PREFIX } from './telemetry/policy';

export const SIGNED_OUT_KEY_PREFIXES: readonly string[] = [LOG_KEY_PREFIX, TELEMETRY_POLICY_KEY_PREFIX];

export const dropSignedOutKeys = (store: KeyValueStore): void => {
    store
        .keys()
        .filter(key => SIGNED_OUT_KEY_PREFIXES.some(prefix => key.startsWith(prefix)))
        .forEach(key => store.remove(key));
};
