import type { UserTokenView } from '@lemoncloud/chatic-backend-api';
import type { ScopedCacheDataSource } from './factory';
import { createScopedDataSource } from './factory';
import { TABLES } from '../core';

export const userTokenDataSource: ScopedCacheDataSource<UserTokenView> = createScopedDataSource<UserTokenView>(
    TABLES.USER_TOKENS
);
