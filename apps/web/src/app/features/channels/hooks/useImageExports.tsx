import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime, isPendingUploadSlot, type DomainChat } from '@chatic/runtime-react';
import { logger } from '@chatic/bridges';
import { ToastAction } from '@chatic/ui-kit/components/ui/toast';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { appBridge } from '../../../bridge/appBridge';
import { useCanExportImages } from '../../../bridge/shellCapabilities';
import { getShellDownloads } from '../../../bridge/shellDownload';
import { exportMediaInBrowser, type BrowserMediaDeps, type BrowserMediaOutcome } from '../lib/browserMediaExport';
import { canShareFilesInBrowser, shareFileInBrowser } from '../lib/browserShare';
import { saveFileInBrowser } from '../lib/browserSave';
import { fetchInBrowser } from '../lib/fileDownload';
import {
    exportMedia,
    saveAllMedia,
    toastFor,
    toastForSaveAll,
    type ExportMediaKind,
    type MediaExportAction,
    type MediaExportDeps,
    type MediaExportToast,
} from '../lib/imageExport';

export interface ExportableMedia {
    uploadId: string;
    url: string | undefined;
    name?: string;
    kind: ExportMediaKind;
    broken?: boolean;
    chatId?: string;
}

export interface MediaExportBusy {
    action: MediaExportAction;
    progress: number | null;
    step?: { current: number; total: number };
}

export const isExportableUrl = (url: string | undefined): url is string => !!url && url.startsWith('https:');

const isReady = (item: ExportableMedia): item is ExportableMedia & { url: string } =>
    isExportableUrl(item.url) && !item.broken;

export const useImageExports = ({ cid, chatId }: { cid: string; chatId?: string }) => {
    const { t } = useTranslation();
    const shellExports = useCanExportImages();
    const inBrowser = !shellExports && runtime.files.transfers === null;
    const canExport = shellExports || inBrowser;
    const [browserShares] = useState(() => inBrowser && canShareFilesInBrowser());
    const canShare = shellExports || browserShares;
    const [busy, setBusy] = useState<ReadonlyMap<string, MediaExportBusy>>(() => new Map());
    const shares = useRef(new Set<AbortController>());
    const runs = useRef(new Set<AbortController>());
    const running = useRef(new Set<string>());
    const held = useRef(new Map<string, Blob>());

    const mark = useCallback((uploadIds: readonly string[], value: MediaExportBusy | null) => {
        setBusy(previous => {
            const next = new Map(previous);
            for (const uploadId of uploadIds) {
                if (value) next.set(uploadId, value);
                else next.delete(uploadId);
            }
            return next;
        });
    }, []);

    const freshUrlOf = useCallback(
        async (item: ExportableMedia): Promise<string | undefined> => {
            const from = item.chatId ?? chatId;
            if (!from) return undefined;
            const chat: DomainChat = await runtime.data.getCloudRepositories(cid).chat.getChat({ id: from });
            const slot = chat.upload$$?.find(entry => !isPendingUploadSlot(entry) && entry.id === item.uploadId);
            return slot && !isPendingUploadSlot(slot) ? (slot.orgUrl ?? slot.thumbUrl ?? undefined) : undefined;
        },
        [cid, chatId]
    );

    const depsFor = useCallback(
        (item: ExportableMedia): MediaExportDeps => {
            const downloads = getShellDownloads();
            return {
                download: input => downloads.start({ ...input, title: item.name }),
                acknowledge: ids => downloads.acknowledge(ids),
                save: uri => appBridge.saveToPhotoLibrary(uri),
                share: (uri, title) => appBridge.shareFile(uri, title),
                freshUrl: () => freshUrlOf(item),
                log: (message, data) => logger.error('DOWNLOAD', message, data),
            };
        },
        [freshUrlOf]
    );

    const browserDepsFor = useCallback(
        (item: ExportableMedia): BrowserMediaDeps => ({
            fetch: (url, options) => fetchInBrowser(url, options),
            freshUrl: () => freshUrlOf(item),
            save: (blob, name) => saveFileInBrowser(blob, name),
            share: (blob, name) => shareFileInBrowser(blob, name),
        }),
        [freshUrlOf]
    );

    const show = useCallback(
        (shown: MediaExportToast | null) => {
            if (!shown) return;
            const settings = t('chat.attach.export.settings');
            toast({
                title: t(shown.titleKey, shown.values),
                ...(shown.variant === 'destructive' ? { variant: 'destructive' as const } : {}),
                ...(shown.settings
                    ? {
                          action: (
                              <ToastAction altText={settings} onClick={() => appBridge.openSettings()}>
                                  {settings}
                              </ToastAction>
                          ),
                      }
                    : {}),
            });
        },
        [t]
    );

    const showBrowser = useCallback(
        (outcome: BrowserMediaOutcome, kind: ExportableMedia['kind']) => {
            if (outcome.kind === 'needs-gesture') toast({ title: t('chat.attach.browserShare.again') });
            if (outcome.kind === 'failed') {
                toast({
                    title: t(kind === 'video' ? 'chat.attach.export.failedVideo' : 'chat.attach.export.failed'),
                    variant: 'destructive',
                });
            }
        },
        [t]
    );

    const runInBrowser = useCallback(
        async (action: MediaExportAction, item: ExportableMedia & { url: string }, signal: AbortSignal) => {
            const kept = held.current.get(item.uploadId);
            held.current.delete(item.uploadId);
            const outcome = await exportMediaInBrowser(
                {
                    action,
                    url: item.url,
                    name: item.name,
                    uploadId: item.uploadId,
                    kind: item.kind,
                    held: kept,
                    signal,
                    onProgress: fraction => mark([item.uploadId], { action, progress: fraction }),
                },
                browserDepsFor(item)
            );
            if (outcome.kind === 'needs-gesture') held.current.set(item.uploadId, outcome.held);
            return outcome;
        },
        [browserDepsFor, mark]
    );

    const run = useCallback(
        async (action: MediaExportAction, item: ExportableMedia) => {
            if (!isReady(item) || running.current.has(item.uploadId)) return;
            if (action === 'share' && !canShare) return;
            running.current.add(item.uploadId);
            const controller = new AbortController();
            if (action === 'share') shares.current.add(controller);
            mark([item.uploadId], { action, progress: null });

            if (inBrowser) {
                const outcome = await runInBrowser(action, item, controller.signal);
                shares.current.delete(controller);
                running.current.delete(item.uploadId);
                mark([item.uploadId], null);
                showBrowser(outcome, item.kind);
                return;
            }

            const outcome = await exportMedia(
                {
                    action,
                    kind: item.kind,
                    url: item.url,
                    name: item.name,
                    signal: controller.signal,
                    onProgress: ({ transferredBytes, totalBytes }) =>
                        mark([item.uploadId], {
                            action,
                            progress: totalBytes > 0 ? transferredBytes / totalBytes : null,
                        }),
                },
                depsFor(item)
            );
            shares.current.delete(controller);
            running.current.delete(item.uploadId);
            mark([item.uploadId], null);
            show(toastFor(outcome, item.kind));
        },
        [canShare, depsFor, inBrowser, mark, runInBrowser, show, showBrowser]
    );

    const savable = useCallback((items: readonly ExportableMedia[]) => items.filter(isReady), []);

    const runAll = useCallback(
        async (items: readonly ExportableMedia[]) => {
            const queue = items.filter(
                (item): item is ExportableMedia & { url: string } =>
                    isReady(item) && !running.current.has(item.uploadId)
            );
            if (queue.length === 0) return;
            if (inBrowser) {
                const controller = new AbortController();
                runs.current.add(controller);
                let failed = 0;
                for (const item of queue) {
                    if (controller.signal.aborted) break;
                    running.current.add(item.uploadId);
                    mark([item.uploadId], { action: 'save', progress: null });
                    const outcome = await runInBrowser('save', item, new AbortController().signal);
                    running.current.delete(item.uploadId);
                    mark([item.uploadId], null);
                    if (outcome.kind === 'failed') failed += 1;
                }
                runs.current.delete(controller);
                if (failed > 0) {
                    showBrowser({ kind: 'failed' }, queue.some(item => item.kind === 'video') ? 'video' : 'image');
                }
                return;
            }
            const ids = queue.map(item => item.uploadId);
            for (const id of ids) running.current.add(id);
            const controller = new AbortController();
            runs.current.add(controller);
            mark(ids, { action: 'save', progress: null, step: { current: 1, total: queue.length } });

            const results = await saveAllMedia(
                queue,
                depsFor,
                ({ current, total, fraction }) =>
                    mark(ids, { action: 'save', progress: fraction > 0 ? fraction : null, step: { current, total } }),
                controller.signal
            );
            runs.current.delete(controller);
            for (const id of ids) running.current.delete(id);
            mark(ids, null);
            show(toastForSaveAll(results));
        },
        [depsFor, inBrowser, mark, runInBrowser, show, showBrowser]
    );

    const stopOnClose = useCallback(() => {
        for (const controller of shares.current) controller.abort();
        shares.current.clear();
        for (const controller of runs.current) controller.abort();
        held.current.clear();
    }, []);

    useEffect(() => stopOnClose, [stopOnClose]);

    return {
        canExport,
        canShare,
        canSaveAll: shellExports,
        savable,
        busyFor: (uploadId: string) => busy.get(uploadId),
        run,
        runAll,
        stopOnClose,
    };
};
