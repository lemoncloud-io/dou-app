import type { KeyValueStore } from '../types';
import type { NativeStore } from './types';

/** Whether `store` is one the shell keeps — one that has to be loaded and whose writes are confirmed. */
export const isNativeStore = (store: KeyValueStore): store is NativeStore =>
    typeof (store as Partial<NativeStore>).hydrate === 'function' &&
    typeof (store as Partial<NativeStore>).flush === 'function';
