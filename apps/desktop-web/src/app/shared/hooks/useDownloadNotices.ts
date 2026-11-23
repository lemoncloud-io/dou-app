import { createElement, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { ToastAction, type ToastActionElement } from '@chatic/ui-kit/components/ui/toast';
import { TOAST_DURATION_MS } from '@chatic/ui-kit/components/ui/toaster';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { getDownloadsApi, type DownloadsApi } from '../utils/electronApi';

const JOIN_MS = TOAST_DURATION_MS - 500;

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
            const joining = batch && now - batch.openedAt < JOIN_MS ? batch : null;
            const count = joining ? joining.count + 1 : 1;
            const props = {
                description: count > 1 ? t('download.savedCount', { count }) : t('download.saved', { name: done.name }),
                ...(done.id && { action: revealAction(api, done.id, t) }),
            };
            if (joining) {
                joining.notice.update({ ...props, id: joining.notice.id });
                joining.count = count;
            } else {
                const notice = toast({
                    ...props,
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
    return createElement(ToastAction, { altText: label, onClick: reveal }, label) as unknown as ToastActionElement;
};

const revealLabelKey = (): string => {
    const platform = typeof window === 'undefined' ? '' : window.electronAPI?.platform;
    if (platform === 'darwin') return 'download.showInFinder';
    if (platform === 'win32') return 'download.showInExplorer';
    return 'download.showInFolder';
};
