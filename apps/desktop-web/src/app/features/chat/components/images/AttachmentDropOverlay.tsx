import { useTranslation } from 'react-i18next';

import { Paperclip } from 'lucide-react';

import { MAX_ATTACHMENTS } from '../../utils';

/**
 * Shown over the conversation while files are dragged in (Figma "#image drag over"): a
 * dashed drop zone, an attachment mark, and the limit. Pointer-transparent, so the drag
 * events keep landing on the pane underneath.
 *
 * It said "images and files" under a drawing of a code file and a note, and then
 * refused both, when only images were taken. Now images, videos and documents are, and the
 * copy says files; the mark uses the app's own accent instead of three hues found nowhere else.
 */
export const AttachmentDropOverlay = () => {
    const { t } = useTranslation();
    return (
        <div
            aria-hidden
            className="pointer-events-none absolute inset-x-6 bottom-5 top-4 z-overlay flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-description/60 bg-background/95 animate-fade-in"
        >
            <span className="mb-2 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-raised">
                <Paperclip size={28} aria-hidden />
            </span>
            <p className="text-headline font-semibold text-foreground">{t('chat.attach.dropTitle')}</p>
            <p className="text-callout text-label">{t('chat.attach.dropHint', { count: MAX_ATTACHMENTS })}</p>
        </div>
    );
};
