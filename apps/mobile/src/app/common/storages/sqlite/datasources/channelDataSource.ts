import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { ScopedCacheDataSource } from './factory';
import { createScopedDataSource } from './factory';
import { TABLES } from '../core';

export const channelDataSource: ScopedCacheDataSource<ChannelView> = createScopedDataSource<ChannelView>(
    TABLES.CHANNELS
);
