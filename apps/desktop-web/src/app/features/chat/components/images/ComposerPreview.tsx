import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import type { ComposerAttachment } from '../../hooks';
import { canPreview, type ChatFile } from '../../utils';
import { FileViewer } from './FileViewer';
import { fitStyle } from './ImageViewer';

/** A composer attachment as the file viewer takes it: its object URL, and the type the browser gave the file. */
const toChatFile = (attachment: ComposerAttachment): ChatFile => ({
    id: attachment.id,
    kind: attachment.kind === 'video' ? 'video' : 'file',
    name: attachment.name,
    size: attachment.size,
    contentType: attachment.file.type,
    url: attachment.url,
});

/**
 * Whether a tray tile opens in `ComposerPreview`. An image or a video always does; a document only
 * when the feed's viewer would draw it (PDF, text) — nothing in the page draws an office or Hancom file.
 */
export const canPreviewAttachment = (attachment: ComposerAttachment): boolean =>
    !!attachment.url && (attachment.kind !== 'file' || canPreview(toChatFile(attachment)) !== null);

interface ComposerPreviewProps {
    /** A tile `canPreviewAttachment` opens. */
    attachment: ComposerAttachment;
    onClose: () => void;
}

/**
 * A picked file at full size, before it is sent: the tile is a 92px crop, or only a name.
 *
 * A document opens in the feed's `FileViewer`, read from the file the page already holds. An image or
 * a video gets the image viewer's frame with the picture or player alone — no sender, save or copy,
 * since there is no message yet.
 */
export const ComposerPreview = ({ attachment, onClose }: ComposerPreviewProps) => {
    const { t } = useTranslation();
    const closeRef = useRef<HTMLButtonElement>(null);
    // The picture's own size, so a small one is held to the image viewer's upscale cap and looks
    // the same here as it will once sent.
    const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);

    if (attachment.kind === 'file') {
        return <FileViewer file={toChatFile(attachment)} local={attachment.file} onClose={onClose} />;
    }

    return (
        <Dialog open onOpenChange={open => !open && onClose()}>
            <DialogContent
                closeLabel={t('common.close')}
                variant="bare"
                hideClose
                overlayClassName="bg-overlay/70"
                // Focus lands on close, as in the file viewer: the first control is a video's player,
                // where Space would start playback.
                onOpenAutoFocus={event => {
                    event.preventDefault();
                    closeRef.current?.focus();
                }}
                className="inset-8 flex flex-col gap-0 overflow-hidden rounded-[20px] bg-muted shadow-overlay outline-none"
            >
                <DialogTitle className="sr-only">{attachment.name}</DialogTitle>
                <DialogDescription className="sr-only">{t('chat.attach.unsent')}</DialogDescription>
                <div className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-4 pt-8">
                    {attachment.kind === 'video' ? (
                        <video src={attachment.url} controls className="h-full w-full rounded-sm bg-black" />
                    ) : (
                        <img
                            src={attachment.url}
                            alt={attachment.name}
                            draggable={false}
                            onLoad={event =>
                                setNatural({
                                    width: event.currentTarget.naturalWidth,
                                    height: event.currentTarget.naturalHeight,
                                })
                            }
                            style={fitStyle(natural)}
                            className="h-full w-full select-none rounded-sm object-contain"
                        />
                    )}
                    <button
                        ref={closeRef}
                        type="button"
                        onClick={onClose}
                        aria-label={t('common.close')}
                        className="focus-ring absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-foreground/[0.08]"
                    >
                        <X size={20} aria-hidden />
                    </button>
                </div>
                <div className="flex shrink-0 items-baseline gap-2 px-8 pb-6">
                    <span className="min-w-0 truncate text-caption font-medium text-foreground">{attachment.name}</span>
                    <span className="shrink-0 text-caption text-description">{t('chat.attach.unsent')}</span>
                </div>
            </DialogContent>
        </Dialog>
    );
};
