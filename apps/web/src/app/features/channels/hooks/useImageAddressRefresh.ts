import { useCallback } from 'react';

import { perfNow } from '@chatic/perf';
import { runtime } from '@chatic/runtime-react';

export interface ImageRefreshReport {
    kind: 'image' | 'file';
    outcome: 'ok' | 'failed';
    ms: number;
}

export type ImageRefreshObserver = () => ((report: ImageRefreshReport) => void) | undefined;

const refreshed = new Set<string>();

let refreshObserver: ImageRefreshObserver | undefined;

export const setImageRefreshObserver = (observer: ImageRefreshObserver | undefined): void => {
    refreshObserver = observer;
};

const beginRefreshReport = (): ((report: ImageRefreshReport) => void) | undefined => {
    try {
        return refreshObserver?.();
    } catch {
        return undefined;
    }
};

export const resetImageAddressRefresh = (): void => refreshed.clear();

export const useImageAddressRefresh = () =>
    useCallback(
        async ({
            cid,
            chatId,
            src,
            kind = 'image',
        }: {
            cid: string;
            chatId: string;
            src: string;
            kind?: ImageRefreshReport['kind'];
        }): Promise<boolean> => {
            const key = `${chatId}|${src}`;
            if (!chatId || refreshed.has(key)) return false;
            refreshed.add(key);
            const ended = beginRefreshReport();
            const startedAt = perfNow();
            let outcome: ImageRefreshReport['outcome'] = 'ok';
            try {
                await runtime.data.getCloudRepositories(cid).chat.getChat({ id: chatId });
            } catch {
                outcome = 'failed';
            }
            try {
                ended?.({ kind, outcome, ms: perfNow() - startedAt });
            } catch {
                // Ignored, as above.
            }
            return true;
        },
        []
    );
