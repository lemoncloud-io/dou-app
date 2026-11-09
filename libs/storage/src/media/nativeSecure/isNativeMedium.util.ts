import type { KeyValueStore } from '../types';
import type { NativeMedium } from './types';

/** Whether `medium` is one the shell keeps — one that has to be loaded and whose writes are confirmed. */
export const isNativeMedium = (medium: KeyValueStore): medium is NativeMedium =>
    typeof (medium as Partial<NativeMedium>).hydrate === 'function' &&
    typeof (medium as Partial<NativeMedium>).flush === 'function';
