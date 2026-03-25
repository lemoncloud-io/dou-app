import type { CloudView } from '@lemoncloud/chatic-backend-api';
import type { ScopedCacheDataSource } from './factory';
import { createScopedDataSource } from './factory';
import { TABLES } from '../core';

export const cloudDataSource: ScopedCacheDataSource<CloudView> = createScopedDataSource<CloudView>(TABLES.CLOUDS);
