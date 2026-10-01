import { useCallback, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { isNative } from '@chatic/bridges';
import type { ChatFileSlot } from '@chatic/data';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import type { MessageFileDownloadState } from '@chatic/web-ui-kit';

import { downloadInBrowser } from '../lib/fileDownload';
import { useImageAddressRefresh } from './useImageAddressRefresh';

interface Running {
    controller: AbortController;
}

/**
 * Downloads in progress, by the card's key — one per page, so a row that scrolls out and back, or the
 * same message in a room and its thread, shows the same download.
 */
const running = new Map<string, Running>();
let version = 0;
const listeners = new Set<() => void>();
const changed = () => {
    version += 1;
    listeners.forEach(listener => listener());
};
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
};
const getVersion = () => version;

/**
 * A message's document cards: what each download button shows, and what pressing a card does.
 *
 * In a browser the file is fetched and saved under its own name. A signed address that has expired
 * (403) has the message read again for fresh ones, and the user presses again. Inside the app the page
 * cannot save a file — the WebView ignores `download` — and the shell's save is not wired here yet, so
 * every app shows the update notice where the button would be.
 */
export const useFileDownloads = ({ cid, chatId }: { cid: string; chatId?: string }) => {
    const { t } = useTranslation();
    const refresh = useImageAddressRefresh();
    const snapshot = useSyncExternalStore(subscribe, getVersion);

    const stateOf = useCallback(
        (file: ChatFileSlot): MessageFileDownloadState =>
            isNative() ? 'unavailable' : running.has(file.key) ? 'downloading' : 'idle',
        // A new function whenever a download starts or ends, so a memoised card re-renders.
        [snapshot]
    );

    const download = useCallback(
        async (file: ChatFileSlot) => {
            if (isNative() || !file.url || running.has(file.key)) return;
            const entry: Running = { controller: new AbortController() };
            running.set(file.key, entry);
            changed();
            try {
                const result = await downloadInBrowser(file.url, file.name ?? t('chat.attach.fileCard.fallbackName'), {
                    signal: entry.controller.signal,
                });
                if (result === 'expired' && chatId) void refresh({ cid, chatId, src: file.url });
                if (result === 'expired' || result === 'failed') {
                    toast({ title: t('chat.attach.fileCard.downloadFailed'), variant: 'destructive' });
                }
            } finally {
                running.delete(file.key);
                changed();
            }
        },
        [chatId, cid, refresh, t]
    );

    const cancel = useCallback((file: ChatFileSlot) => running.get(file.key)?.controller.abort(), []);

    return { stateOf, download, cancel };
};
