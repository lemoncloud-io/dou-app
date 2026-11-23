import type { KeyValueStore } from '../types';
import type { NativeStore } from './types';

export const isNativeStore = (store: KeyValueStore): store is NativeStore =>
    typeof (store as Partial<NativeStore>).hydrate === 'function' &&
    typeof (store as Partial<NativeStore>).flush === 'function';
