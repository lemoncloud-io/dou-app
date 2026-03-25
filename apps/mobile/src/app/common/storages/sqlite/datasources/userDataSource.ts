import type { UserView } from '@lemoncloud/chatic-socials-api';
import type { ScopedCacheDataSource } from './factory';
import { createScopedDataSource } from './factory';
import { TABLES } from '../core';

export const userDataSource: ScopedCacheDataSource<UserView> = createScopedDataSource<UserView>(TABLES.USERS);
