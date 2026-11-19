import type { KeyValueStore } from '@chatic/storage';

import { LOG_KEY_PREFIX } from './logging/logUploadStore';
import { TELEMETRY_POLICY_KEY_PREFIX } from './telemetry/policy';

/**
 * The keys this app writes outside the session that a sign-out takes: the log pipeline's (unsent
 * batches carry the account that just left) and the telemetry policy's. On a launch the page owns, the
 * runtime takes them (the declaration's `signedOutKeyPrefixes`, `src/config/policies.ts`). On one the
 * phone shell owns, the runtime runs in the shell and never sees the page's storage, so the page takes
 * them itself.
 */
export const SIGNED_OUT_KEY_PREFIXES: readonly string[] = [LOG_KEY_PREFIX, TELEMETRY_POLICY_KEY_PREFIX];

/** Removes every key under `SIGNED_OUT_KEY_PREFIXES` from `store`. Collected first: removing while walking shifts it. */
export const dropSignedOutKeys = (store: KeyValueStore): void => {
    store
        .keys()
        .filter(key => SIGNED_OUT_KEY_PREFIXES.some(prefix => key.startsWith(prefix)))
        .forEach(key => store.remove(key));
};
