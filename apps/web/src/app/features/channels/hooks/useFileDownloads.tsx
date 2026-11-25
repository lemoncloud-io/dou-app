import { useCallback, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime, isPendingUploadSlot, type ChatFileSlot, type DomainChat } from '@chatic/runtime-react';
import { logger } from '@chatic/bridges';
import { ToastAction } from '@chatic/ui-kit/components/ui/toast';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import { messageFileKind, type MessageFileDownloadState } from '@chatic/web-ui-kit';

import { appBridge } from '../../../bridge/appBridge';
import { getShellDownloads } from '../../../bridge/shellDownload';
import { downloadInBrowser } from '../lib/fileDownload';
import { exportFile, type FileExportDeps, type FileExportOutcome, type FileUse } from '../lib/fileExport';
import { useImageAddressRefresh } from './useImageAddressRefresh';

interface Downloading {
    controller: AbortController;
    progress: number | null;
}

const downloading = new Map<string, Downloading>();
const busy = new Set<string>();
const kept = new Map<string, string>();
const heldBytes = new Map<string, Blob>();

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

export const resetFileDownloads = (): void => {
    downloading.clear();
    busy.clear();
    kept.clear();
    heldBytes.clear();
    changed();
};

type Translate = ReturnType<typeof useTranslation>['t'];

interface Context {
    cid: string;
    chatId?: string;
    t: Translate;
}

type AppTransfers = NonNullable<(typeof runtime.files)['transfers']>;

interface AppContext extends Context {
    transfers: AppTransfers;
}

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

const depsFor = (
    { cid, chatId, transfers }: AppContext,
    file: ChatFileSlot,
    controller: AbortController
): FileExportDeps => {
    const downloads = getShellDownloads();
    return {
        download: input => {
            downloading.set(file.key, { controller, progress: null });
            changed();
            return downloads.start({ ...input, title: file.name });
        },
        acknowledge: ids => downloads.acknowledge(ids),
        open: uri => transfers.openFile(uri),
        save: async (uri, name) => ({ data: await transfers.saveFile(uri, name) }),
        share: (uri, title) => appBridge.shareFile(uri, title),
        freshUrl: () => freshFileUrl(cid, chatId, file),
        kept: () => kept.get(file.key),
        keep: uri => {
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

const actionButton = (label: string, onClick: () => void) => (
    <ToastAction altText={label} onClick={onClick}>
        {label}
    </ToastAction>
);

const report = (context: AppContext, file: ChatFileSlot, outcome: FileExportOutcome): void => {
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
            toast({ title: t('chat.attach.fileCard.saveNeedsUpdate') });
            return;
        case 'failed':
            toast({ title: t('chat.attach.fileCard.downloadFailed'), variant: 'destructive' });
            return;
        default:
            return;
    }
};

const perform = async (
    context: AppContext,
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

const reportBatch = (
    context: AppContext,
    outcomes: readonly (FileExportOutcome | undefined)[],
    retry: () => void
): void => {
    const { t } = context;
    const first = outcomes.find(outcome => outcome?.kind === 'permission' || outcome?.kind === 'save-update-required');
    if (first) {
        report(context, {} as ChatFileSlot, first);
        return;
    }
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

const downloadHere = async ({ cid, chatId, t }: Context, file: ChatFileSlot, refresh: Refresh): Promise<void> => {
    if (!file.url || downloading.has(file.key)) return;
    const entry: Downloading = { controller: new AbortController(), progress: null };
    downloading.set(file.key, entry);
    changed();
    try {
        const held = heldBytes.get(file.key);
        heldBytes.delete(file.key);
        const result = await downloadInBrowser(file.url, file.name ?? t('chat.attach.fileCard.fallbackName'), {
            signal: entry.controller.signal,
            held,
            onHeld: blob => heldBytes.set(file.key, blob),
        });
        if (result === 'needs-gesture') toast({ title: t('chat.attach.browserShare.again') });
        if (result === 'expired' && chatId) void refresh({ cid, chatId, src: file.url, kind: 'file' });
        if (result === 'expired' || result === 'failed') {
            toast({ title: t('chat.attach.fileCard.downloadFailed'), variant: 'destructive' });
        }
    } finally {
        downloading.delete(file.key);
        changed();
    }
};

type Refresh = ReturnType<typeof useImageAddressRefresh>;

export interface BatchFile {
    file: ChatFileSlot;
    chatId?: string;
}

const appTransfers = (): AppTransfers | null => runtime.files.transfers;

export const opensInPageViewer = (file: ChatFileSlot): boolean =>
    appTransfers() === null &&
    file.state === 'ready' &&
    !!file.url &&
    !file.audio &&
    (messageFileKind(file.name) === 'pdf' || file.contentType === 'application/pdf');

const saveFiles = async (context: Context, list: readonly BatchFile[], refresh: Refresh): Promise<void> => {
    const transfers = appTransfers();
    if (!transfers) {
        for (const { file, chatId } of list) await downloadHere({ ...context, chatId }, file, refresh);
        return;
    }
    const inApp = { ...context, transfers };
    const outcomes: (FileExportOutcome | undefined)[] = [];
    for (const { file, chatId } of list) outcomes.push(await perform({ ...inApp, chatId }, 'save', file, true));
    const failed = list.filter((_, at) => outcomes[at]?.kind === 'failed');
    reportBatch(inApp, outcomes, () => void saveFiles(context, failed, refresh));
};

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
            if (appTransfers() === null) return downloading.has(file.key) ? 'downloading' : 'idle';
            if (downloading.has(file.key)) return 'downloading';
            return kept.has(file.key) ? 'done' : 'idle';
        },
        [snapshot]
    );

    const progressOf = useCallback(
        (file: ChatFileSlot): number | null => downloading.get(file.key)?.progress ?? null,
        [snapshot]
    );

    const download = useCallback(
        async (file: ChatFileSlot, fromChatId?: string) => {
            const context = { cid, chatId: fromChatId ?? chatId, t };
            const transfers = appTransfers();
            if (!transfers) return downloadHere(context, file, refresh);
            await perform({ ...context, transfers }, 'save', file);
        },
        [chatId, cid, refresh, t]
    );

    const open = useCallback(
        async (file: ChatFileSlot, fromChatId?: string) => {
            const context = { cid, chatId: fromChatId ?? chatId, t };
            if (onPreview && opensInPageViewer(file)) {
                onPreview(file, context.chatId);
                return;
            }
            const transfers = appTransfers();
            if (!transfers) return downloadHere(context, file, refresh);
            await perform({ ...context, transfers }, 'open', file);
        },
        [chatId, cid, onPreview, refresh, t]
    );

    const share = useCallback(
        async (file: ChatFileSlot, fromChatId?: string) => {
            const transfers = appTransfers();
            if (!transfers) return;
            await perform({ cid, chatId: fromChatId ?? chatId, t, transfers }, 'share', file);
        },
        [chatId, cid, t]
    );

    const cancel = useCallback((file: ChatFileSlot) => downloading.get(file.key)?.controller.abort(), []);

    const saveAll = useCallback(
        (list: readonly BatchFile[]): Promise<void> => saveFiles({ cid, chatId, t }, list, refresh),
        [chatId, cid, refresh, t]
    );

    return { stateOf, progressOf, download, open, share, cancel, saveAll };
};
