import { DomStorageAdapter } from './domStorageAdapter';

import type { KeyValueStore } from '../stores/types';

export const asDomStorage = (store: KeyValueStore): Storage => new DomStorageAdapter(store);
