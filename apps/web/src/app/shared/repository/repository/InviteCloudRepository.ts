import { createNativeDBAdapter } from '../../data/local/nativeDBAdapter';
import type { CacheStorage } from '../../data/local/cacheStorage';
import type { InviteCloudView } from '@chatic/app-messages';

export type StorageRepository<T> = CacheStorage<T>;

export const inviteCloudRepository = (): StorageRepository<InviteCloudView> =>
    createNativeDBAdapter<InviteCloudView>('invitecloud', '');
