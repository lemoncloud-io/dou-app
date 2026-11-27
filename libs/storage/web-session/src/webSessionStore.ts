import { WebStore } from '@chatic/storage-web-local';
import type { KeyValueStore } from '@chatic/storage-compose';

export const webSessionStore = (): KeyValueStore => WebStore.session();
