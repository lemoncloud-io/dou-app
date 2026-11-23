import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import type { ComposerAttachment } from '../../hooks';
import { canPreview, type ChatFile } from '../../utils';
import { FileViewer } from './FileViewer';
import { fitStyle } from './ImageViewer';

const toChatFile = (attachment: ComposerAttachment): ChatFile => ({
    id: attachment.id,
    kind: attachment.kind === 'video' ? 'video' : 'file',
    name: attachment.name,
    size: attachment.size,
    contentType: attachment.file.type,
    url: attachment.url,
});

export const isAudioAttachment = (attachment: ComposerAttachment): boolean =>
    !!attachment.url && attachment.kind === 'file' && canPreview(toChatFile(attachment)) === 'audio';

export const canPreviewAttachment = (attachment: ComposerAttachment): boolean => {
    if (!attachment.url) return false;
    if (attachment.kind !== 'file') return true;
    const preview = canPreview(toChatFile(attachment));
    return preview !== null && preview !== 'audio';
};

interface ComposerPreviewProps {
    attachment: ComposerAttachment;
    onClose: () => void;
}

export const ComposerPreview = ({ attachment, onClose }: ComposerPreviewProps) => {
    const { t } = useTranslation();
    const closeRef = useRef<HTMLButtonElement>(null);
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
