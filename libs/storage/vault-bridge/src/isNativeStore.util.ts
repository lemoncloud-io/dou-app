import type { KeyValueStore } from '@chatic/storage-compose';
import type { NativeStore } from './types';

export const isNativeStore = (store: KeyValueStore): store is NativeStore =>
    typeof (store as Partial<NativeStore>).hydrate === 'function' &&
    typeof (store as Partial<NativeStore>).flush === 'function';
