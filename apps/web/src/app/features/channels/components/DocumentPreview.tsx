import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Share } from 'lucide-react';

import type { ChatFileSlot } from '@chatic/runtime';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import { DocumentViewer, MediaViewerActionButton, type DocumentViewerStatus } from '@chatic/web-ui-kit';

import { freshFileUrl, useFileDownloads } from '../hooks/useFileDownloads';
import { canShareFilesInBrowser, shareFileInBrowser } from '../lib/browserShare';
import { saveFileInBrowser } from '../lib/browserSave';
import { fetchInBrowser, type BrowserFetchResult } from '../lib/fileDownload';
import { loadPdf, preloadPdf, type PdfDocument } from '../lib/pdf';

export interface DocumentPreviewTarget {
    file: ChatFileSlot;
    chatId?: string;
}

interface DocumentPreviewProps {
    cid: string;
    target: DocumentPreviewTarget | null;
    onClose: () => void;
}

interface Loaded {
    status: DocumentViewerStatus;
    pages?: PdfDocument;
    blob?: Blob;
}

const RELEASE_AFTER_CLOSE_MS = 500;

const fetchFile = async (
    cid: string,
    target: DocumentPreviewTarget,
    signal: AbortSignal
): Promise<BrowserFetchResult> => {
    const url = target.file.url ?? '';
    const first = await fetchInBrowser(url, { signal });
    if (first.kind !== 'expired') return first;
    const fresh = await freshFileUrl(cid, target.chatId, target.file).catch(() => undefined);
    if (!fresh || fresh === url || signal.aborted) return first;
    return fetchInBrowser(fresh, { signal });
};

export const DocumentPreview = ({ cid, target, onClose }: DocumentPreviewProps) => {
    const { t } = useTranslation();
    const shownRef = useRef<DocumentPreviewTarget | null>(target);
    if (target) shownRef.current = target;
    const shown = target ?? shownRef.current;
    const files = useFileDownloads({ cid, chatId: shown?.chatId });
    const [held, setLoaded] = useState<Loaded & { for?: DocumentPreviewTarget }>({ status: 'loading' });
    const [sharing, setSharing] = useState(false);
    const canShare = useMemo(() => canShareFilesInBrowser(), []);
    const openRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (!target?.file.url) return;
        const controller = new AbortController();
        openRef.current = controller;
        let doc: PdfDocument | undefined;
        const open = async (): Promise<Loaded> => {
            preloadPdf();
            const result = await fetchFile(cid, target, controller.signal);
            if (result.kind !== 'blob') return { status: 'failed' };
            try {
                doc = await loadPdf(result.blob);
                return { status: 'ready', pages: doc, blob: result.blob };
            } catch {
                return { status: 'failed', blob: result.blob };
            }
        };
        void open().then(next => {
            if (controller.signal.aborted) doc?.destroy();
            else setLoaded({ ...next, for: target });
        });
        return () => {
            controller.abort();
            doc?.destroy();
        };
    }, [cid, target]);

    useEffect(() => {
        if (target) return;
        const timer = setTimeout(() => {
            shownRef.current = null;
            setLoaded({ status: 'loading' });
        }, RELEASE_AFTER_CLOSE_MS);
        return () => clearTimeout(timer);
    }, [target]);

    if (!shown) return null;
    const { file, chatId } = shown;
    const loaded: Loaded = held.for === shown ? held : { status: 'loading' };
    const name = file.name ?? t('chat.attach.fileCard.fallbackName');

    const save = async () => {
        if (!loaded.blob) {
            void files.download(file, chatId);
            return;
        }
        const saved = await saveFileInBrowser(loaded.blob, name);
        if (saved === 'needs-gesture') toast({ title: t('chat.attach.browserShare.again') });
        if (saved === 'failed') toast({ title: t('chat.attach.browserShare.saveFailed'), variant: 'destructive' });
    };

    const share = async () => {
        if (sharing) return;
        setSharing(true);
        try {
            const signal = openRef.current?.signal ?? AbortSignal.abort();
            let blob = loaded.blob;
            if (!blob) {
                const result = await fetchFile(cid, shown, signal);
                if (signal.aborted) return;
                if (result.kind !== 'blob') {
                    toast({ title: t('chat.attach.fileCard.downloadFailed'), variant: 'destructive' });
                    return;
                }
                const fetched = result.blob;
                blob = fetched;
                setLoaded(previous => (previous.for === shown ? { ...previous, blob: fetched } : previous));
            }
            const outcome = await shareFileInBrowser(blob, name);
            if (signal.aborted) return;
            if (outcome === 'needs-gesture') toast({ title: t('chat.attach.browserShare.again') });
            if (outcome === 'failed') toast({ title: t('chat.attach.browserShare.failed'), variant: 'destructive' });
        } finally {
            setSharing(false);
        }
    };

    const saving = files.stateOf(file) === 'downloading';

    return (
        <DocumentViewer
            open={target !== null}
            name={name}
            status={loaded.status}
            pages={loaded.pages}
            onClose={onClose}
            renderFooter={() => (
                <>
                    {canShare ? (
                        <MediaViewerActionButton
                            label={t('chat.attach.document.share', { name })}
                            onClick={() => void share()}
                            disabled={loaded.status === 'loading'}
                            busy={sharing}
                        >
                            <Share className="size-5" aria-hidden="true" />
                        </MediaViewerActionButton>
                    ) : (
                        <span aria-hidden="true" />
                    )}
                    <MediaViewerActionButton
                        label={t('chat.attach.document.save', { name })}
                        onClick={() => void save()}
                        busy={saving}
                        progress={saving ? files.progressOf(file) : null}
                    >
                        <Download className="size-5" aria-hidden="true" />
                    </MediaViewerActionButton>
                </>
            )}
            labels={{
                close: t('chat.attach.viewerClose'),
                loading: t('chat.attach.document.loading', { name }),
                failed: t('chat.attach.document.failed'),
            }}
        />
    );
};
