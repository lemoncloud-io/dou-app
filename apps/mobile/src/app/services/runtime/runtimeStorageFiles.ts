import { createMMKV } from 'react-native-mmkv';

import type { KeyValueFile } from '@chatic/runtime-mobile';

import type { SessionOwnerFile } from './sessionOwner';

/**
 * The runtime's own MMKV files. Never opened by anything else in the app. `mode` holds only which side
 * owns the session, apart from the runtime's stores so that clearing them never changes the owner.
 */
export const RUNTIME_STORAGE_IDS = {
    plain: 'chatic-runtime-plain',
    device: 'chatic-runtime-device',
    mode: 'chatic-runtime-mode',
} as const;

/**
 * Opens the runtime's plain and device files. Kept apart from `runtimePorts.ts` so that file and its
 * tests never load the native module.
 */
export const openRuntimeStorageFiles = (): { plain: KeyValueFile; device: KeyValueFile } => ({
    plain: createMMKV({ id: RUNTIME_STORAGE_IDS.plain }),
    device: createMMKV({ id: RUNTIME_STORAGE_IDS.device }),
});

/** Opens the file the session owner is kept in. */
export const openSessionOwnerFile = (): SessionOwnerFile => createMMKV({ id: RUNTIME_STORAGE_IDS.mode });
