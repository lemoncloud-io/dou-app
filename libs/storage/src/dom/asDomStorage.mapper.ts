import { DomStorageAdapter } from './domStorageAdapter';

import type { KeyValueStore } from '../stores/types';

/** `store` seen as a DOM `Storage`. */
export const asDomStorage = (store: KeyValueStore): Storage => new DomStorageAdapter(store);
