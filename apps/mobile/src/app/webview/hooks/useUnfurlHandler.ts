import { useCallback } from 'react';

import { useServices } from '../../hooks';
import type { WebMessageData } from '@chatic/app-messages';

export const useUnfurlHandler = () => {
    const { unfurlService, logService: logger } = useServices();

    /**
     * Fetches og: metadata for a chat link preview on the webview's behalf (it can't read
     * cross-origin pages).
     *
     * The envelope stays `success: true` even when the page yields no preview — `data.success`
     * carries that. The web side has to tell "this page has no og tags" apart from a bridge
     * failure, because the latter is exactly what an older shell without this handler returns
     * (NOT_FOUND), and the two deserve the same silent outcome for different reasons.
     */
    const handleFetchUrlMetadata = useCallback(
        async (message: WebMessageData<'FetchUrlMetadata'>) => {
            const { url } = message.data;
            try {
                const data = await unfurlService.fetchUrlMetadata(url);
                return { type: 'OnFetchUrlMetadata' as const, success: true, data };
            } catch (error: any) {
                // The service is written not to throw; if it ever does, that's still just "no
                // preview" to the user.
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
