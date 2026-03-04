import { useCallback } from 'react';

import { Logger } from '../../services';
import { CacheRepository } from '../../services/cache';

import type { WebViewBridge } from './useBaseBridge';
import type { AppMessageData, FetchAllCacheData, FetchCacheData, SaveCacheData } from '@chatic/app-messages';

export const useCacheHandler = (bridge: WebViewBridge) => {
    const handleFetchAllCacheData = useCallback(
        async (data: FetchAllCacheData['data']) => {
            try {
                let items: any[] = [];
                switch (data.type) {
                    case 'channel':
                        items = await CacheRepository.getAllChannels();
                        break;
                    case 'chat':
                        items = await CacheRepository.getAllChats();
                        break;
                    case 'user':
                        items = await CacheRepository.getAllUsers();
                        break;
                    case 'join':
                        items = await CacheRepository.getAllJoins();
                        break;
                }

                const response: AppMessageData<'OnFetchAllCacheData'> = {
                    type: 'OnFetchAllCacheData',
                    data: {
                        type: data.type,
                        items,
                    },
                };
                bridge.post(response);
            } catch (e) {
                Logger.error('CACHE', `FetchAll error: ${data.type}`, e);
            }
        },
        [bridge]
    );

    const handleFetchCacheData = useCallback(
        async (data: FetchCacheData['data']) => {
            try {
                let item: any = null;
                switch (data.type) {
                    case 'channel':
                        item = await CacheRepository.getChannel(data.id);
                        break;
                    case 'chat':
                        item = await CacheRepository.getChat(data.id);
                        break;
                    case 'user':
                        item = await CacheRepository.getUser(data.id);
                        break;
                    case 'join':
                        item = await CacheRepository.getJoin(data.id);
                        break;
                }

                const response: AppMessageData<'OnFetchCacheData'> = {
                    type: 'OnFetchCacheData',
                    data: {
                        type: data.type,
                        id: data.id,
                        item,
                    },
                };
                bridge.post(response);
            } catch (e) {
                Logger.error('CACHE', `Fetch error: ${data.type} ${data.id}`, e);
            }
        },
        [bridge]
    );

    const handleSaveCacheData = useCallback(
        async (data: SaveCacheData['data']) => {
            try {
                switch (data.type) {
                    case 'channel':
                        await CacheRepository.saveChannel(data.id, data.value as any);
                        break;
                    case 'chat':
                        await CacheRepository.saveChat(data.id, data.value as any);
                        break;
                    case 'user':
                        await CacheRepository.saveUser(data.id, data.value as any);
                        break;
                    case 'join':
                        await CacheRepository.saveJoin(data.id, data.value as any);
                        break;
                }

                const response: AppMessageData<'OnSaveCacheData'> = {
                    type: 'OnSaveCacheData',
                    data: {
                        type: data.type,
                        id: data.id,
                    },
                };
                bridge.post(response);
            } catch (e) {
                Logger.error('CACHE', `Save error: ${data.type} ${data.id}`, e);
            }
        },
        [bridge]
    );

    return {
        handleFetchAllCacheData,
        handleFetchCacheData,
        handleSaveCacheData,
    };
};
