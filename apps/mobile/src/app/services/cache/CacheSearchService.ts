import type {
    CacheChannelView,
    CacheChatView,
    CacheSiteView,
    CacheModelMap,
    CacheQueryMap,
} from '@chatic/app-messages';
import type { ILogService } from '../log';
import type { ICacheSearchService } from './types';
import type { ICacheDataSource } from '../../data/cache';

export class CacheSearchService implements ICacheSearchService {
    private readonly logService: ILogService;
    private readonly channelDataSource: ICacheDataSource<CacheModelMap['channel'], CacheQueryMap['channel']>;
    private readonly chatDataSource: ICacheDataSource<CacheModelMap['chat'], CacheQueryMap['chat']>;
    private readonly siteDataSource: ICacheDataSource<CacheModelMap['site'], CacheQueryMap['site']>;

    constructor(
        logService: ILogService,
        channelDataSource: ICacheDataSource<CacheModelMap['channel'], CacheQueryMap['channel']>,
        chatDataSource: ICacheDataSource<CacheModelMap['chat'], CacheQueryMap['chat']>,
        siteDataSource: ICacheDataSource<CacheModelMap['site'], CacheQueryMap['site']>
    ) {
        this.logService = logService;
        this.channelDataSource = channelDataSource;
        this.chatDataSource = chatDataSource;
        this.siteDataSource = siteDataSource;
    }

    public async search(
        keyword: string,
        cid?: string,
        uid?: string
    ): Promise<(CacheChannelView | CacheChatView | CacheSiteView)[]> {
        if (!keyword || keyword.trim() === '') return [];

        try {
            const [channels, chats, sites] = await Promise.all([
                this.channelDataSource.fetchAll(cid, { keyword }, uid),
                this.chatDataSource.fetchAll(cid, { keyword }, uid),
                this.siteDataSource.fetchAll(cid, { keyword }, uid),
            ]);

            const formattedChannels = channels.map(item => ({ ...item, _domain: 'channel' as const }));
            const formattedChats = chats.map(item => ({ ...item, _domain: 'chat' as const }));
            const formattedSites = sites.map(item => ({ ...item, _domain: 'site' as const }));

            const combinedResults = [...formattedChannels, ...formattedChats, ...formattedSites];

            return combinedResults.sort((a, b) => ((b.createdAt as number) || 0) - ((a.createdAt as number) || 0));
        } catch (error) {
            this.logService.error('CACHE', `Failed global search for: ${keyword}`, error as Error);
            return [];
        }
    }
}
