import type { ScopedCacheDataSource } from './factory';
import { createScopedDataSource } from './factory';
import { TABLES } from '../core';
import type { CacheSiteView } from '@chatic/app-messages';

export const siteDataSource: ScopedCacheDataSource<CacheSiteView> = createScopedDataSource<CacheSiteView>(TABLES.SITES);
