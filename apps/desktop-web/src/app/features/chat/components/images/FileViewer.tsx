import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertCircle, Download, X } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { TEXT_PREVIEW_MAX_BYTES, canPreview, fetchFileBytes, readTextPreview, type ChatFile } from '../../utils';
import { loadPdf, preloadPdf, type PdfDocument } from '../../utils/pdf';
import { AuthorAvatar, type ImageAuthor } from './ImageViewer';
import { ImageSpinner } from './ImageSpinner';
import { PdfPages } from './PdfPages';
import { Hint } from '../../../../shared';

interface FileViewerProps {
    /** A file `canPreview` opens. */
    file: ChatFile;
    author: ImageAuthor;
    onClose: () => void;
    /** The card's own save: the whole file, under its name. */
    onSave: () => void;
}

const ICON_BUTTON =
    'focus-ring flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent';

type Body =
    | { state: 'loading' }
    | { state: 'failed' }
    | { state: 'text'; text: string; truncated: boolean }
    | { state: 'pdf'; doc: PdfDocument };

/**
 * A sent document, read in the app: the sender, time and name above it, with save and close. The
 * bytes are fetched when it opens and dropped when it closes; closing mid-download stops the fetch.
 * A fetch that fails — an address past its signature, say — says so and still offers the save.
 */
export const FileViewer = ({ file, author, onClose, onSave }: FileViewerProps) => {
    const { t } = useTranslation();
    const name = file.name ?? t('chat.attach.previewFile');
    const [body, setBody] = useState<Body>({ state: 'loading' });
    const closeRef = useRef<HTMLButtonElement>(null);

    const preview = canPreview(file);
    useEffect(() => {
        // A re-signed address reloads; the last body may hold a document the cleanup below destroyed.
        setBody({ state: 'loading' });
        const controller = new AbortController();
        let doc: PdfDocument | undefined;
        const open = async (): Promise<Body> => {
            if (preview !== 'pdf') {
                const start = await fetchFileBytes(file.url, controller.signal, TEXT_PREVIEW_MAX_BYTES);
                return { state: 'text', ...(await readTextPreview(start, file.size)) };
            }
            preloadPdf();
            const blob = await fetchFileBytes(file.url, controller.signal);
            doc = await loadPdf(blob);
            return { state: 'pdf', doc };
        };
        open()
            .then(next => (controller.signal.aborted ? doc?.destroy() : setBody(next)))
            .catch(() => !controller.signal.aborted && setBody({ state: 'failed' }));
        return () => {
            controller.abort();
            doc?.destroy();
        };
    }, [file.url, file.size, preview]);

    const saveButton = (
        <Hint label={t('chat.file.save', { name })}>
            <button type="button" onClick={onSave} aria-label={t('chat.file.save', { name })} className={ICON_BUTTON}>
                <Download size={20} aria-hidden />
            </button>
        </Hint>
    );

    return (
        <Dialog open onOpenChange={open => !open && onClose()}>
            <DialogContent
                closeLabel={t('common.close')}
                variant="bare"
                hideClose
                overlayClassName="bg-overlay/70"
                // Focus lands on close, not on the first control: that is save, whose tooltip would
                // open with the dialog and take the first Esc for itself.
                onOpenAutoFocus={event => {
                    event.preventDefault();
                    closeRef.current?.focus();
                }}
                className="inset-8 flex flex-col gap-0 overflow-hidden rounded-[20px] bg-background shadow-overlay outline-none"
            >
                <DialogTitle className="sr-only">{name}</DialogTitle>
                <DialogDescription className="sr-only">{t('chat.file.viewer')}</DialogDescription>
                <header className="flex h-[68px] shrink-0 items-center gap-3 border-b border-hairline px-6">
                    <AuthorAvatar author={author} />
                    <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-lead font-bold text-foreground">{author.name}</span>
                        <span className="flex min-w-0 gap-1.5 text-caption font-medium text-description">
                            <span className="shrink-0">{author.time}</span>
                            <span aria-hidden>·</span>
                            <span className="truncate">{name}</span>
                        </span>
                    </div>
                    {saveButton}
                    <button
                        ref={closeRef}
                        type="button"
                        onClick={onClose}
                        aria-label={t('common.close')}
                        className={ICON_BUTTON}
                    >
                        <X size={20} aria-hidden />
                    </button>
                </header>
                <div className="relative flex min-h-0 flex-1 bg-muted">
                    {body.state === 'loading' && (
                        <span
                            role="status"
                            aria-label={t('chat.file.opening', { name })}
                            className="m-auto flex h-10 w-10 items-center justify-center"
                        >
                            <ImageSpinner className="h-8 w-8 border-foreground/20 border-t-foreground" />
                        </span>
                    )}
                    {body.state === 'failed' && (
                        <div className="m-auto flex flex-col items-center gap-3 text-center">
                            <AlertCircle size={28} aria-hidden className="text-destructive" />
                            <p className="text-callout text-foreground">{t('chat.file.openFailed')}</p>
                            <button
                                type="button"
                                onClick={onSave}
                                className="focus-ring rounded-md border border-hairline bg-background px-3 py-1.5 text-callout font-medium text-foreground hover:bg-accent"
                            >
                                {t('chat.file.save', { name })}
                            </button>
                        </div>
                    )}
                    {body.state === 'pdf' && <PdfPages doc={body.doc} name={name} />}
                    {body.state === 'text' && (
                        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
                            {body.truncated && (
                                <p className="sticky top-0 border-b border-hairline bg-background px-8 py-2 text-caption text-description">
                                    {t('chat.file.truncated')}
                                </p>
                            )}
                            <pre className="mx-auto max-w-[960px] whitespace-pre-wrap break-words px-8 py-6 font-mono text-callout text-foreground">
                                {body.text}
                            </pre>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
