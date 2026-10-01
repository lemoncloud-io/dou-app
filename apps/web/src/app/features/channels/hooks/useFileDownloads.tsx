import { useCallback, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { isNative, logger, webClient } from '@chatic/bridges';
import { isPendingUploadSlot, type ChatFileSlot, type DomainChat } from '@chatic/data';
import { ToastAction } from '@chatic/ui-kit/components/ui/toast';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import type { MessageFileDownloadState } from '@chatic/web-ui-kit';

import { appBridge } from '../../../bridge/appBridge';
import { getShellDownloads } from '../../../bridge/shellDownload';
import { downloadInBrowser } from '../lib/fileDownload';
import { exportFile, type FileExportDeps, type FileExportOutcome, type FileUse } from '../lib/fileExport';
import { useImageAddressRefresh } from './useImageAddressRefresh';

/**
 * How long an open, save or share may wait for the shell: on iOS each answers only when its sheet or
 * preview closes, however long the user keeps it up. A shorter clock would drop that answer.
 */
const SHELL_USE_TIMEOUT_MS = 10 * 60_000;

interface Downloading {
    controller: AbortController;
    /** `0`..`1` once the length is known. */
    progress: number | null;
}

// Page-level, by the card's key, so a row that scrolls out and back, or the same message in a room
// and its thread, shows the same download — and finds the file the other one already fetched.
/** Downloads in flight. */
const downloading = new Map<string, Downloading>();
/** Cards with an open, save or share in flight, download phase or not: a second press waits it out. */
const busy = new Set<string>();
/** Files the shell downloaded this session: card key → `file://` URI. */
const kept = new Map<string, string>();
/** The shell answered `NOT_FOUND` to `OpenFile`/`SaveFile` (or to downloads): an app built before them. */
let updateRequired = false;

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

/** Test seam — forgets every download, kept file and what was learned about the shell. */
export const resetFileDownloads = (): void => {
    downloading.clear();
    busy.clear();
    kept.clear();
    updateRequired = false;
    changed();
};

type Translate = ReturnType<typeof useTranslation>['t'];

interface Context {
    cid: string;
    chatId?: string;
    t: Translate;
}

/** The shell and the data layer, for one card. */
const depsFor = ({ cid, chatId }: Context, file: ChatFileSlot, controller: AbortController): FileExportDeps => {
    const downloads = getShellDownloads();
    return {
        download: input => {
            downloading.set(file.key, { controller, progress: null });
            changed();
            return downloads.start({ ...input, title: file.name });
        },
        acknowledge: ids => downloads.acknowledge(ids),
        open: uri => webClient.request({ type: 'OpenFile', data: { uri } }, { timeoutMs: SHELL_USE_TIMEOUT_MS }),
        save: (uri, name) =>
            webClient.request({ type: 'SaveFile', data: { uri, name } }, { timeoutMs: SHELL_USE_TIMEOUT_MS }),
        share: (uri, title) => appBridge.shareFile(uri, title),
        freshUrl: async () => {
            if (!chatId || !file.uploadId) return undefined;
            const chat: DomainChat = await runtime.data.getCloudRepositories(cid).chat.getChat({ id: chatId });
            const slot = chat.upload$$?.find(entry => !isPendingUploadSlot(entry) && entry.id === file.uploadId);
            return slot && !isPendingUploadSlot(slot) ? (slot.orgUrl ?? undefined) : undefined;
        },
        kept: () => kept.get(file.key),
        keep: uri => {
            // The file is here: whatever follows is the OS surface's, not the card's progress.
            kept.set(file.key, uri);
            downloading.delete(file.key);
            changed();
        },
        forget: () => {
            if (kept.delete(file.key)) changed();
        },
        log: (message, data) => logger.error('DOWNLOAD', message, data),
    };
};

/** A toast's one action button. */
const actionButton = (label: string, onClick: () => void) => (
    <ToastAction altText={label} onClick={onClick}>
        {label}
    </ToastAction>
);

/** Speaks for an outcome, and learns from the one that says the app is too old. */
const report = (context: Context, file: ChatFileSlot, outcome: FileExportOutcome): void => {
    const { t } = context;
    switch (outcome.kind) {
        case 'saved': {
            const open = t('chat.attach.fileCard.openAction');
            toast({
                title: t('chat.attach.fileCard.saved'),
                description: outcome.location,
                action: actionButton(open, () => void perform(context, 'open', file)),
            });
            return;
        }
        case 'permission': {
            const settings = t('chat.attach.export.settings');
            toast({
                title: t('chat.attach.fileCard.storagePermission'),
                variant: 'destructive',
                action: actionButton(settings, () => appBridge.openSettings()),
            });
            return;
        }
        case 'update-required':
            // The card's own notice says it; a toast on top would say it twice.
            if (!updateRequired) {
                updateRequired = true;
                changed();
            }
            return;
        case 'share-update-required':
            toast({ title: t('chat.attach.fileCard.shareUpdateRequired') });
            return;
        case 'failed':
            toast({ title: t('chat.attach.fileCard.downloadFailed'), variant: 'destructive' });
            return;
        default:
            // Opened, shared, a dismissed sheet, a cancel or a timeout: the OS surface was the feedback.
            return;
    }
};

/** One open, save or share of a card's file inside the app. */
const perform = async (context: Context, use: FileUse, file: ChatFileSlot): Promise<void> => {
    if (!file.url || busy.has(file.key)) return;
    busy.add(file.key);
    const controller = new AbortController();
    let outcome: FileExportOutcome;
    try {
        outcome = await exportFile(
            {
                use,
                url: file.url,
                name: file.name ?? context.t('chat.attach.fileCard.fallbackName'),
                signal: controller.signal,
                onProgress: ({ transferredBytes, totalBytes }) => {
                    const entry = downloading.get(file.key);
                    if (!entry) return;
                    entry.progress = totalBytes > 0 ? Math.min(1, transferredBytes / totalBytes) : null;
                    changed();
                },
            },
            depsFor(context, file, controller)
        );
    } catch {
        outcome = { kind: 'failed' };
    } finally {
        busy.delete(file.key);
        downloading.delete(file.key);
        changed();
    }
    report(context, file, outcome);
};

/** The browser's download: fetch, then save under the upload's own name. */
const downloadHere = async ({ cid, chatId, t }: Context, file: ChatFileSlot, refresh: Refresh): Promise<void> => {
    if (!file.url || downloading.has(file.key)) return;
    const entry: Downloading = { controller: new AbortController(), progress: null };
    downloading.set(file.key, entry);
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
        downloading.delete(file.key);
        changed();
    }
};

type Refresh = ReturnType<typeof useImageAddressRefresh>;

/**
 * A message's document cards: what each download button shows, and what pressing a card does.
 *
 * In a browser the button and the card body both fetch the file and save it under its own name. A
 * signed address that has expired (403) has the message read again for fresh ones, and the user
 * presses again.
 *
 * Inside the app the shell downloads the file — the card shows its progress, and pressing again
 * cancels — and the page then hands the file on: the button keeps it on the device (`SaveFile`), the
 * card body opens it (`OpenFile`, or the share sheet when nothing opens the format), and the action
 * sheet shares it. The downloaded file is remembered for the session, so the card turns `done` and
 * every later use skips the download. An app without `OpenFile`/`SaveFile` is learned from its first
 * `NOT_FOUND`, and every card then shows the update notice for the page's life.
 */
export const useFileDownloads = ({ cid, chatId }: { cid: string; chatId?: string }) => {
    const { t } = useTranslation();
    const refresh = useImageAddressRefresh();
    const snapshot = useSyncExternalStore(subscribe, getVersion);

    const stateOf = useCallback(
        (file: ChatFileSlot): MessageFileDownloadState => {
            if (!isNative()) return downloading.has(file.key) ? 'downloading' : 'idle';
            if (updateRequired) return 'unavailable';
            if (downloading.has(file.key)) return 'downloading';
            return kept.has(file.key) ? 'done' : 'idle';
        },
        // A new function whenever a download starts, moves or ends, so a memoised card re-renders.
        [snapshot]
    );

    const progressOf = useCallback(
        (file: ChatFileSlot): number | null => downloading.get(file.key)?.progress ?? null,
        [snapshot]
    );

    /** The download button: in the app, download if needed and keep it on the device. */
    const download = useCallback(
        async (file: ChatFileSlot) => {
            const context = { cid, chatId, t };
            if (!isNative()) return downloadHere(context, file, refresh);
            if (updateRequired) return;
            return perform(context, 'save', file);
        },
        [chatId, cid, refresh, t]
    );

    /** The card body, and a `done` button: in the app, download if needed and open it. */
    const open = useCallback(
        async (file: ChatFileSlot) => {
            const context = { cid, chatId, t };
            if (!isNative()) return downloadHere(context, file, refresh);
            if (updateRequired) return;
            return perform(context, 'open', file);
        },
        [chatId, cid, refresh, t]
    );

    /** The action sheet's "Share file": in the app only, download if needed and put it on the share sheet. */
    const share = useCallback(
        async (file: ChatFileSlot) => {
            if (!isNative()) return;
            return perform({ cid, chatId, t }, 'share', file);
        },
        [chatId, cid, t]
    );

    const cancel = useCallback((file: ChatFileSlot) => downloading.get(file.key)?.controller.abort(), []);

    return { stateOf, progressOf, download, open, share, cancel };
};
