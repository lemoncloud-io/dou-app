import type { CloudView } from '@lemoncloud/chatic-backend-api';
import type { DefaultCacheDataSource } from './factory';
import { createDefaultDataSource } from './factory';
import { TABLES } from '../core';

export const cloudDataSource: DefaultCacheDataSource<CloudView> = createDefaultDataSource<CloudView>(TABLES.CLOUDS);
