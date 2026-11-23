import { createMMKV } from 'react-native-mmkv';

import type { KeyValueFile } from '@chatic/runtime-mobile';

import type { SessionOwnerFile } from './sessionOwner';

export const RUNTIME_STORAGE_IDS = {
    plain: 'chatic-runtime-plain',
    device: 'chatic-runtime-device',
    mode: 'chatic-runtime-mode',
} as const;

export const openRuntimeStorageFiles = (): { plain: KeyValueFile; device: KeyValueFile } => ({
    plain: createMMKV({ id: RUNTIME_STORAGE_IDS.plain }),
    device: createMMKV({ id: RUNTIME_STORAGE_IDS.device }),
});

export const openSessionOwnerFile = (): SessionOwnerFile => createMMKV({ id: RUNTIME_STORAGE_IDS.mode });
