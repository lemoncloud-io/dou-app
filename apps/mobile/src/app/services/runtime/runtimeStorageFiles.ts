import { createMMKV } from 'react-native-mmkv';

import type { KeyValueFile } from '@chatic/runtime-mobile';

/** The runtime's own MMKV files. Never opened by anything else in the app. */
export const RUNTIME_STORAGE_IDS = { plain: 'chatic-runtime-plain', device: 'chatic-runtime-device' } as const;

/**
 * Opens the runtime's plain and device files. Kept apart from `runtimePorts.ts` so that file and its
 * tests never load the native module.
 */
export const openRuntimeStorageFiles = (): { plain: KeyValueFile; device: KeyValueFile } => ({
    plain: createMMKV({ id: RUNTIME_STORAGE_IDS.plain }),
    device: createMMKV({ id: RUNTIME_STORAGE_IDS.device }),
});
