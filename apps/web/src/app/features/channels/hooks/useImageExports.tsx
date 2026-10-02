import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { isPendingUploadSlot, type DomainChat } from '@chatic/data';
import { ToastAction } from '@chatic/ui-kit/components/ui/toast';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { appBridge } from '../../../bridge/appBridge';
import { shellCapabilities, useCanExportImages, useCanExportVideos } from '../../../bridge/shellCapabilities';
import { getShellDownloads } from '../../../bridge/shellDownload';
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

/** One photo or video the viewer can save or share. */
export interface ExportableMedia {
    /** The upload's id — what a refreshed message is searched for, and what keys the busy state. */
    uploadId: string;
    /** Its signed original address. Only `https:` can be fetched by the shell. */
    url: string | undefined;
    /** The name it was sent under, as a hint for the file the shell writes. */
    name?: string;
    kind: ExportMediaKind;
    /** The viewer could not draw it. Its buttons are off and "save all" leaves it out. */
    broken?: boolean;
}

export interface MediaExportBusy {
    action: MediaExportAction;
    /** `0`..`1` once the download's length is known. */
    progress: number | null;
    /** Set while a "save all" runs: the item being saved (1-based) of how many. */
    step?: { current: number; total: number };
}

/** A local preview (`blob:`) or a `data:` address lives only in the page; the shell cannot fetch it. */
export const isExportableUrl = (url: string | undefined): url is string => !!url && url.startsWith('https:');

/** Sent, drawn, and of a kind this app can export: the item can be saved or shared right now. */
const isReady = (item: ExportableMedia, videos: boolean): item is ExportableMedia & { url: string } =>
    isExportableUrl(item.url) && !item.broken && (item.kind !== 'video' || videos);

/**
 * Save and share for the photos and videos of one message, kept per upload so the state survives
 * swiping between pages. Catching up after the page was away is not done here but once for the page
 * (`useShellDownloadCatchUp`). A single save keeps going after the viewer closes and reports when
 * done; a share is cancelled on close — and when the row itself goes away — so its sheet never
 * appears over whatever the user went to next; a "save all" finishes the item it is on and stops.
 *
 * Photos follow the handshake (`canExport`). Videos need that and an app that has not refused one
 * (`canExportVideos`): an app built before videos lists the same messages and answers a video with
 * `UNSUPPORTED_TYPE`, which hides video export for the session.
 */
export const useImageExports = ({ cid, chatId }: { cid: string; chatId?: string }) => {
    const { t } = useTranslation();
    const canExport = useCanExportImages();
    const canExportVideos = useCanExportVideos();
    const [busy, setBusy] = useState<ReadonlyMap<string, MediaExportBusy>>(() => new Map());
    const shares = useRef(new Set<AbortController>());
    const runs = useRef(new Set<AbortController>());
    // Busy state reaches the buttons a render later; two taps inside one frame must not start two.
    const running = useRef(new Set<string>());

    /** Sets the busy state of several uploads in one render. */
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

    /** The shell and the data layer, for one item. */
    const depsFor = useCallback(
        (item: ExportableMedia): MediaExportDeps => {
            const downloads = getShellDownloads();
            return {
                download: input => downloads.start({ ...input, title: item.name }),
                acknowledge: ids => downloads.acknowledge(ids),
                save: uri => appBridge.saveToPhotoLibrary(uri),
                share: (uri, title) => appBridge.shareFile(uri, title),
                freshUrl: async () => {
                    if (!chatId) return undefined;
                    const chat: DomainChat = await runtime.data.getCloudRepositories(cid).chat.getChat({ id: chatId });
                    const slot = chat.upload$$?.find(
                        entry => !isPendingUploadSlot(entry) && entry.id === item.uploadId
                    );
                    // The same address the viewer opens: the original, or the thumbnail when there is none.
                    return slot && !isPendingUploadSlot(slot) ? (slot.orgUrl ?? slot.thumbUrl ?? undefined) : undefined;
                },
                withdraw: () => shellCapabilities.withdrawImageExport(),
                withdrawVideos: () => shellCapabilities.withdrawVideoExport(),
                log: (message, data) => logger.error('DOWNLOAD', message, data),
            };
        },
        [cid, chatId]
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

    const run = useCallback(
        async (action: MediaExportAction, item: ExportableMedia) => {
            // Read at the press, not at the render: a video refused a moment ago is already known here.
            if (!isReady(item, shellCapabilities.canExportVideos()) || running.current.has(item.uploadId)) return;
            running.current.add(item.uploadId);
            const controller = new AbortController();
            if (action === 'share') shares.current.add(controller);
            mark([item.uploadId], { action, progress: null });

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
        [depsFor, mark, show]
    );

    /**
     * What a "save all" over these items would save now, in their order: sent, not broken, and no
     * video once this app refused one. Its length is the count the save sheet offers.
     */
    const savable = useCallback(
        (items: readonly ExportableMedia[]) => items.filter(item => isReady(item, canExportVideos)),
        [canExportVideos]
    );

    /**
     * Saves every savable item of the message, one after another, and reports once at the end. An
     * item already being saved or shared is left to that operation. Every item of the run is busy
     * meanwhile, so neither button can start a second operation on any of them; the progress runs
     * across the whole set, with the position of the item being saved.
     */
    const runAll = useCallback(
        async (items: readonly ExportableMedia[]) => {
            const videos = shellCapabilities.canExportVideos();
            const queue = items.filter(
                (item): item is ExportableMedia & { url: string } =>
                    isReady(item, videos) && !running.current.has(item.uploadId)
            );
            if (queue.length === 0) return;
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
        [depsFor, mark, show]
    );

    /**
     * The viewer closed: stop any share still downloading, and let a "save all" finish the item it is
     * on and go no further. A single save carries on.
     */
    const stopOnClose = useCallback(() => {
        for (const controller of shares.current) controller.abort();
        shares.current.clear();
        for (const controller of runs.current) controller.abort();
    }, []);

    // The row can go without the viewer closing first — a push tap or a deep link leaves the room.
    useEffect(() => stopOnClose, [stopOnClose]);

    /** Whether the viewer shows the buttons on this item at all. */
    const canExportItem = useCallback(
        (item: ExportableMedia) => canExport && (item.kind !== 'video' || canExportVideos),
        [canExport, canExportVideos]
    );

    return {
        canExport,
        canExportVideos,
        canExportItem,
        savable,
        busyFor: (uploadId: string) => busy.get(uploadId),
        run,
        runAll,
        stopOnClose,
    };
};
