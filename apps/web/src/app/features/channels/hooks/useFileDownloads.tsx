import { useCallback, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime, isPendingUploadSlot, type ChatFileSlot, type DomainChat } from '@chatic/runtime';
import { logger, webClient } from '@chatic/bridges';
import { ToastAction } from '@chatic/ui-kit/components/ui/toast';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import { messageFileKind, type MessageFileDownloadState } from '@chatic/web-ui-kit';

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

/** Test seam — forgets every download and kept file. */
export const resetFileDownloads = (): void => {
    downloading.clear();
    busy.clear();
    kept.clear();
    changed();
};

type Translate = ReturnType<typeof useTranslation>['t'];

interface Context {
    cid: string;
    chatId?: string;
    t: Translate;
}

/** Reads the message again and returns this upload's fresh address, if it has one. */
export const freshFileUrl = async (
    cid: string,
    chatId: string | undefined,
    file: Pick<ChatFileSlot, 'uploadId'>
): Promise<string | undefined> => {
    if (!chatId || !file.uploadId) return undefined;
    const chat: DomainChat = await runtime.data.getCloudRepositories(cid).chat.getChat({ id: chatId });
    const slot = chat.upload$$?.find(entry => !isPendingUploadSlot(entry) && entry.id === file.uploadId);
    return slot && !isPendingUploadSlot(slot) ? (slot.orgUrl ?? undefined) : undefined;
};

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
        freshUrl: () => freshFileUrl(cid, chatId, file),
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

/** Speaks for an outcome. */
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
        case 'save-update-required':
            // Not learned for the page: the same app saves every other card.
            toast({ title: t('chat.attach.fileCard.saveNeedsUpdate') });
            return;
        case 'failed':
            toast({ title: t('chat.attach.fileCard.downloadFailed'), variant: 'destructive' });
            return;
        default:
            // Opened, shared, a dismissed sheet, a cancel or a timeout: the OS surface was the feedback.
            return;
    }
};

/**
 * One open, save or share of a card's file inside the app. It speaks for its own outcome unless
 * `quiet`, in which case the caller reports — a batch says once what happened to all of them.
 */
const perform = async (
    context: Context,
    use: FileUse,
    file: ChatFileSlot,
    quiet = false
): Promise<FileExportOutcome | undefined> => {
    if (!file.url || busy.has(file.key)) return undefined;
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
    if (!quiet) report(context, file, outcome);
    return outcome;
};

/**
 * What a batch save says: how many were kept, or how many were not with a way to try those again.
 * A batch that needs the app updated or a storage permission says that instead, once.
 */
const reportBatch = (
    context: Context,
    outcomes: readonly (FileExportOutcome | undefined)[],
    retry: () => void
): void => {
    const { t } = context;
    const first = outcomes.find(outcome => outcome?.kind === 'permission' || outcome?.kind === 'save-update-required');
    if (first) {
        report(context, {} as ChatFileSlot, first);
        return;
    }
    // A file skipped — already being saved, or with no address — is not counted as failed.
    const failed = outcomes.filter(outcome => outcome?.kind === 'failed').length;
    if (failed > 0) {
        const again = t('chat.attach.files.retry');
        toast({
            title: t('chat.attach.files.saveFailedMany', { count: failed }),
            variant: 'destructive',
            action: actionButton(again, retry),
        });
        return;
    }
    const saved = outcomes.filter(outcome => outcome?.kind === 'saved').length;
    if (saved > 0) toast({ title: t('chat.attach.files.savedMany', { count: saved }) });
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

/** A file of a batch, with the message it came from — each is re-signed through its own message. */
export interface BatchFile {
    file: ChatFileSlot;
    chatId?: string;
}

/** Whether the app downloads and keeps files on this host, as the host's `files` port says. */
const appMovesFiles = (): boolean => runtime.files.kind === 'shell';

/**
 * Whether pressing a card opens the page's own document viewer instead of downloading: a sent PDF, in
 * a browser. The app opens files with the OS (QuickLook, the Android viewer), which already reads
 * them; a browser had nothing between the card and a download, and a phone browser then shows the
 * downloaded PDF in place of the page, with no way back to the room.
 */
export const opensInPageViewer = (file: ChatFileSlot): boolean =>
    !appMovesFiles() &&
    file.state === 'ready' &&
    !!file.url &&
    !file.audio &&
    (messageFileKind(file.name) === 'pdf' || file.contentType === 'application/pdf');

/** A batch save: each file in turn, one report at the end whose retry runs the failed ones again. */
const saveFiles = async (context: Context, list: readonly BatchFile[], refresh: Refresh): Promise<void> => {
    if (!appMovesFiles()) {
        for (const { file, chatId } of list) await downloadHere({ ...context, chatId }, file, refresh);
        return;
    }
    const outcomes: (FileExportOutcome | undefined)[] = [];
    for (const { file, chatId } of list) outcomes.push(await perform({ ...context, chatId }, 'save', file, true));
    const failed = list.filter((_, at) => outcomes[at]?.kind === 'failed');
    reportBatch(context, outcomes, () => void saveFiles(context, failed, refresh));
};

/**
 * A message's document cards: what each download button shows, and what pressing a card does.
 *
 * The host's `files` port says which of the two ways below applies: `browser` is a browser's, `shell`
 * the app's.
 *
 * In a browser the button and the card body both fetch the file and save it under its own name. A
 * signed address that has expired (403) has the message read again for fresh ones, and the user
 * presses again.
 *
 * Inside the app the shell downloads the file — the card shows its progress, and pressing again
 * cancels — and the page then hands the file on: the button keeps it on the device (`SaveFile`), the
 * card body opens it (`OpenFile`, or the share sheet when nothing opens the format), and the action
 * sheet shares it. The downloaded file is remembered for the session, so the card turns `done` and
 * every later use skips the download.
 *
 * A list that mixes messages (the room's file list) passes each file's own message (`fromChatId`), so
 * an expired address is signed again through the message the file belongs to.
 *
 * A host that draws the document viewer passes `onPreview`: in a browser the card body then opens a
 * PDF there (`opensInPageViewer`) rather than downloading it. The button still downloads.
 */
export const useFileDownloads = ({
    cid,
    chatId,
    onPreview,
}: {
    cid: string;
    chatId?: string;
    onPreview?: (file: ChatFileSlot, chatId: string | undefined) => void;
}) => {
    const { t } = useTranslation();
    const refresh = useImageAddressRefresh();
    const snapshot = useSyncExternalStore(subscribe, getVersion);

    const stateOf = useCallback(
        (file: ChatFileSlot): MessageFileDownloadState => {
            if (!appMovesFiles()) return downloading.has(file.key) ? 'downloading' : 'idle';
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
        async (file: ChatFileSlot, fromChatId?: string) => {
            const context = { cid, chatId: fromChatId ?? chatId, t };
            if (!appMovesFiles()) return downloadHere(context, file, refresh);
            await perform(context, 'save', file);
        },
        [chatId, cid, refresh, t]
    );

    /**
     * The card body, and a `done` button: in the app, download if needed and open it; in a browser, a
     * PDF opens in the host's viewer when it has one, and anything else downloads.
     */
    const open = useCallback(
        async (file: ChatFileSlot, fromChatId?: string) => {
            const context = { cid, chatId: fromChatId ?? chatId, t };
            if (onPreview && opensInPageViewer(file)) {
                onPreview(file, context.chatId);
                return;
            }
            if (!appMovesFiles()) return downloadHere(context, file, refresh);
            await perform(context, 'open', file);
        },
        [chatId, cid, onPreview, refresh, t]
    );

    /** The action sheet's "Share file": in the app only, download if needed and put it on the share sheet. */
    const share = useCallback(
        async (file: ChatFileSlot, fromChatId?: string) => {
            if (!appMovesFiles()) return;
            await perform({ cid, chatId: fromChatId ?? chatId, t }, 'share', file);
        },
        [chatId, cid, t]
    );

    const cancel = useCallback((file: ChatFileSlot) => downloading.get(file.key)?.controller.abort(), []);

    /**
     * Saves several files one after another — the room file list's selection — and reports once at the
     * end. In a browser each is downloaded as the button does.
     */
    const saveAll = useCallback(
        (list: readonly BatchFile[]): Promise<void> => saveFiles({ cid, chatId, t }, list, refresh),
        [chatId, cid, refresh, t]
    );

    return { stateOf, progressOf, download, open, share, cancel, saveAll };
};
