import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { isPendingUploadSlot, type DomainChat } from '@chatic/data';
import { ToastAction } from '@chatic/ui-kit/components/ui/toast';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { appBridge } from '../../../bridge/appBridge';
import { shellCapabilities, useCanExportImages } from '../../../bridge/shellCapabilities';
import { getShellDownloads } from '../../../bridge/shellDownload';
import {
    exportImage,
    saveAllImages,
    toastFor,
    toastForSaveAll,
    type ImageExportAction,
    type ImageExportDeps,
    type ImageExportToast,
} from '../lib/imageExport';

/** One image the viewer can save or share. */
export interface ExportableImage {
    /** The upload's id — what a refreshed message is searched for, and what keys the busy state. */
    uploadId: string;
    /** Its signed original address. Only `https:` can be fetched by the shell. */
    url: string | undefined;
    /** The name it was sent under, as a hint for the file the shell writes. */
    name?: string;
}

export interface ImageExportBusy {
    action: ImageExportAction;
    /** `0`..`1` once the download's length is known. */
    progress: number | null;
}

/** A local preview (`blob:`) or a `data:` address lives only in the page; the shell cannot fetch it. */
export const isExportableUrl = (url: string | undefined): url is string => !!url && url.startsWith('https:');

/**
 * Save and share for the images of one message, kept per upload so the state survives swiping
 * between pages. Catching up after the page was away is not done here but once for the page
 * (`useShellDownloadCatchUp`). A save keeps going after the viewer closes and reports when done; a share is
 * cancelled on close — and when the row itself goes away — so its sheet never appears over whatever
 * the user went to next.
 */
export const useImageExports = ({ cid, chatId }: { cid: string; chatId?: string }) => {
    const { t } = useTranslation();
    const canExport = useCanExportImages();
    const [busy, setBusy] = useState<ReadonlyMap<string, ImageExportBusy>>(() => new Map());
    const shares = useRef(new Set<AbortController>());
    // Busy state reaches the buttons a render later; two taps inside one frame must not start two.
    const running = useRef(new Set<string>());

    /** Sets the busy state of several uploads in one render. */
    const mark = useCallback((uploadIds: readonly string[], value: ImageExportBusy | null) => {
        setBusy(previous => {
            const next = new Map(previous);
            for (const uploadId of uploadIds) {
                if (value) next.set(uploadId, value);
                else next.delete(uploadId);
            }
            return next;
        });
    }, []);

    /** The shell and the data layer, for one image. */
    const depsFor = useCallback(
        (image: ExportableImage): ImageExportDeps => {
            const downloads = getShellDownloads();
            return {
                download: input => downloads.start({ ...input, title: image.name }),
                acknowledge: ids => downloads.acknowledge(ids),
                save: uri => appBridge.saveToPhotoLibrary(uri),
                share: (uri, title) => appBridge.shareFile(uri, title),
                freshUrl: async () => {
                    if (!chatId) return undefined;
                    const chat: DomainChat = await runtime.data.getCloudRepositories(cid).chat.getChat({ id: chatId });
                    const slot = chat.upload$$?.find(
                        entry => !isPendingUploadSlot(entry) && entry.id === image.uploadId
                    );
                    // The same address the viewer opens: the original, or the thumbnail when there is none.
                    return slot && !isPendingUploadSlot(slot) ? (slot.orgUrl ?? slot.thumbUrl ?? undefined) : undefined;
                },
                withdraw: () => shellCapabilities.withdrawImageExport(),
                log: (message, data) => logger.error('DOWNLOAD', message, data),
            };
        },
        [cid, chatId]
    );

    const show = useCallback(
        (shown: ImageExportToast | null) => {
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
        async (action: ImageExportAction, image: ExportableImage) => {
            if (!isExportableUrl(image.url) || running.current.has(image.uploadId)) return;
            running.current.add(image.uploadId);
            const controller = new AbortController();
            if (action === 'share') shares.current.add(controller);
            mark([image.uploadId], { action, progress: null });

            const outcome = await exportImage(
                {
                    action,
                    url: image.url,
                    name: image.name,
                    signal: controller.signal,
                    onProgress: ({ transferredBytes, totalBytes }) =>
                        mark([image.uploadId], {
                            action,
                            progress: totalBytes > 0 ? transferredBytes / totalBytes : null,
                        }),
                },
                depsFor(image)
            );
            shares.current.delete(controller);
            running.current.delete(image.uploadId);
            mark([image.uploadId], null);
            show(toastFor(outcome));
        },
        [depsFor, mark, show]
    );

    /**
     * Saves every exportable image of the message, one after another, and reports once at the end.
     * An image already being saved or shared is left to that operation. Every image of the run is busy
     * meanwhile, so neither button can start a second operation on any of them; the progress runs
     * across the whole set.
     */
    const runAll = useCallback(
        async (images: readonly ExportableImage[]) => {
            const items = images.filter(
                (image): image is ExportableImage & { url: string } =>
                    isExportableUrl(image.url) && !running.current.has(image.uploadId)
            );
            if (items.length === 0) return;
            const ids = items.map(item => item.uploadId);
            for (const id of ids) running.current.add(id);
            mark(ids, { action: 'save', progress: null });

            const outcomes = await saveAllImages(items, depsFor, progress => mark(ids, { action: 'save', progress }));
            for (const id of ids) running.current.delete(id);
            mark(ids, null);
            show(toastForSaveAll(outcomes, items.length));
        },
        [depsFor, mark, show]
    );

    /** The viewer closed: stop any share still downloading. Saves carry on. */
    const cancelShares = useCallback(() => {
        for (const controller of shares.current) controller.abort();
        shares.current.clear();
    }, []);

    // The row can go without the viewer closing first — a push tap or a deep link leaves the room.
    useEffect(() => cancelShares, [cancelShares]);

    return { canExport, busyFor: (uploadId: string) => busy.get(uploadId), run, runAll, cancelShares };
};
