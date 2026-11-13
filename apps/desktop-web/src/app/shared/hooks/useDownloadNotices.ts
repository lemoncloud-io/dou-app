import { createElement, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { ToastAction, type ToastActionElement } from '@chatic/ui-kit/components/ui/toast';
import { TOAST_DURATION_MS } from '@chatic/ui-kit/components/ui/toaster';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { getDownloadsApi, type DownloadsApi } from '../utils/electronApi';

/**
 * How long a notice takes saves into it ("Saved 3 files"). Counted from when it opened, short of
 * its life on screen: a toast closes that long after it opened whatever it was updated to since,
 * and a closed one cannot be brought back by updating it.
 */
const JOIN_MS = TOAST_DURATION_MS - 500;

/**
 * Says when a download ends, inside the desktop shell: "Saved song.mp3" with a way to show it in
 * Finder (Explorer, the file manager). Only the shell knows where a file landed or that its save
 * dialog was dismissed, so a plain browser — and a dismissed dialog — says nothing. Saves that end
 * close together ("Download all") share one notice that counts them; its button shows the last.
 */
export const useDownloadNotices = () => {
    const { t } = useTranslation();
    useEffect(() => {
        const api = getDownloadsApi();
        if (!api) return;
        let batch: { count: number; openedAt: number; notice: ReturnType<typeof toast> } | null = null;
        const unsubscribe = api.onDone(done => {
            if (done.state !== 'completed') {
                toast({ variant: 'destructive', description: t('download.failed', { name: done.name }) });
                return;
            }
            const now = Date.now();
            const joins = batch && now - batch.openedAt < JOIN_MS;
            const count = joins && batch ? batch.count + 1 : 1;
            const props = {
                description: count > 1 ? t('download.savedCount', { count }) : t('download.saved', { name: done.name }),
                ...(done.id && { action: revealAction(api, done.id, t) }),
            };
            if (joins && batch) {
                batch.notice.update({ ...props, id: batch.notice.id });
                batch = { ...batch, count };
            } else {
                const notice = toast({
                    ...props,
                    // Dismissed by the reader before its time: the next save starts a notice of its own.
                    onOpenChange: open => {
                        if (open) return;
                        if (batch?.notice.id === notice.id) batch = null;
                        notice.dismiss();
                    },
                });
                batch = { count, openedAt: now, notice };
            }
        });
        return unsubscribe;
    }, [t]);
};

const revealAction = (api: DownloadsApi, id: string, t: (key: string) => string): ToastActionElement => {
    const label = t(revealLabelKey());
    const reveal = () =>
        void api.reveal(id).then(found => {
            if (!found) toast({ variant: 'destructive', description: t('download.missing') });
        });
    // The kit types its action as `ReactElement<typeof ToastAction>` (the component, not its props),
    // which no created element satisfies.
    return createElement(ToastAction, { altText: label, onClick: reveal }, label) as unknown as ToastActionElement;
};

/** Each system names its file manager; elsewhere it is the folder. */
const revealLabelKey = (): string => {
    const platform = typeof window === 'undefined' ? '' : window.electronAPI?.platform;
    if (platform === 'darwin') return 'download.showInFinder';
    if (platform === 'win32') return 'download.showInExplorer';
    return 'download.showInFolder';
};
