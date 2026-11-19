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

/** The document the viewer shows, and the message it came from (to sign its address again). */
export interface DocumentPreviewTarget {
    file: ChatFileSlot;
    chatId?: string;
}

interface DocumentPreviewProps {
    cid: string;
    /** `null` closes the viewer. */
    target: DocumentPreviewTarget | null;
    onClose: () => void;
}

interface Loaded {
    status: DocumentViewerStatus;
    pages?: PdfDocument;
    /** The file's bytes once fetched — kept even when they would not open, so save and share use them. */
    blob?: Blob;
}

/** The viewer's slide-out (`VIEWER_MOTION`, 300ms) with room to finish before its content goes. */
const RELEASE_AFTER_CLOSE_MS = 500;

/** Fetches the file, reading the message again once for a fresh address when the signed one expired. */
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

/**
 * A sent PDF read in a browser tab, in the photo viewer's frame (`DocumentViewer`), with share and
 * save along the bottom. Before this a press downloaded the file, and a phone browser then showed it in
 * place of the page, with no way back to the room and nothing to save it with.
 *
 * The bytes are fetched once when it opens and dropped once it has slid away. Save and share hand over those
 * same bytes, so neither waits on the network: a share has to start within moments of the press, or
 * the browser refuses it. Before the bytes arrive, save downloads as the card's button does; a file
 * that will not open (a damaged or locked PDF) still offers both.
 */
export const DocumentPreview = ({ cid, target, onClose }: DocumentPreviewProps) => {
    const { t } = useTranslation();
    // The last target, so the viewer keeps its content while it slides away after a close.
    const shownRef = useRef<DocumentPreviewTarget | null>(target);
    if (target) shownRef.current = target;
    const shown = target ?? shownRef.current;
    const files = useFileDownloads({ cid, chatId: shown?.chatId });
    // Keyed by the target it was opened for: the host sets a new object on every open, so reopening the
    // same file starts from the spinner rather than drawing the document the last close freed.
    const [held, setLoaded] = useState<Loaded & { for?: DocumentPreviewTarget }>({ status: 'loading' });
    const [sharing, setSharing] = useState(false);
    const canShare = useMemo(() => canShareFilesInBrowser(), []);
    // Aborted when this open ends, so a share still fetching never brings its sheet up over the room.
    const openRef = useRef<AbortController | null>(null);

    // The host keeps the target in state, so a new object means a new file to open.
    useEffect(() => {
        if (!target?.file.url) return;
        const controller = new AbortController();
        openRef.current = controller;
        let doc: PdfDocument | undefined;
        const open = async (): Promise<Loaded> => {
            // pdf.js arrives while the file is still on its way.
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

    // Once the viewer has slid away, the bytes (up to the 50MB document limit) and the freed document go.
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
    // What was opened for another target — its document already freed — is never drawn for this one.
    const loaded: Loaded = held.for === shown ? held : { status: 'loading' };
    const name = file.name ?? t('chat.attach.fileCard.fallbackName');

    const save = async () => {
        if (!loaded.blob) {
            void files.download(file, chatId);
            return;
        }
        // On iOS this is the share sheet ("Save to Files"); the bytes are already here, so the press
        // is fresh enough for it.
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
                // Kept, so the press the browser asks for next shares at once.
                setLoaded(previous => (previous.for === shown ? { ...previous, blob: fetched } : previous));
            }
            const outcome = await shareFileInBrowser(blob, name);
            // Closed while the sheet was up: what it says no longer belongs to anything on screen.
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
                        // Holds the left end, so save stays at the right as in the photo viewer.
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
