import type { SiteView } from '@lemoncloud/chatic-backend-api';
import type { ScopedCacheDataSource } from './factory';
import { createScopedDataSource } from './factory';
import { TABLES } from '../core';

export const siteDataSource: ScopedCacheDataSource<SiteView> = createScopedDataSource<SiteView>(TABLES.SITES);
