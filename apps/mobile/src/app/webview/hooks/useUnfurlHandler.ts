import { useCallback } from 'react';

import { useServices } from '../../hooks';
import type { WebMessageData } from '@chatic/bridge-messages';

export const useUnfurlHandler = () => {
    const { unfurlService, logService: logger } = useServices();

    const handleFetchUrlMetadata = useCallback(
        async (message: WebMessageData<'FetchUrlMetadata'>) => {
            const { url } = message.data;
            try {
                const data = await unfurlService.fetchUrlMetadata(url);
                return { type: 'OnFetchUrlMetadata' as const, success: true, data };
            } catch (error: any) {
                logger.warn('UNFURL', 'FetchUrlMetadata threw unexpectedly', error);
                return {
                    type: 'OnFetchUrlMetadata' as const,
                    success: true,
                    data: { success: false, url },
                };
            }
        },
        [unfurlService, logger]
    );

    return { handleFetchUrlMetadata };
};
