import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { ConfirmDialog } from '../../../channels';
import { useChatImages } from '../../hooks';
import { useChatImagesStore } from '../../stores';
import { copyImageToClipboard, downloadImage, downloadImages, layoutImageGrid, type ChatImage } from '../../utils';
import { ImageTile } from './ImageTile';
import { ImageSetMeta, ImageViewer, type ImageAuthor } from './ImageViewer';

interface MessageImagesProps {
    /** Server id of the message the images belong to. */
    messageId: string;
    /** "파일 삭제" is offered on your own messages only. */
    canDelete: boolean;
    author: ImageAuthor;
    /** Open this message's thread (the viewer's "Reply"). Absent inside the thread panel. */
    onReply?: () => void;
}

/**
 * A message's images (Figma "#이미지 업로드 케이스").
 *
 * One image: its file name, then the image. Several: "n개 파일 · 전체 다운로드", then a
 * two-column grid of up to four with the fourth counting the rest ("+n"). Any tile opens
 * the viewer on that image; the "+n" tile opens it on the first hidden one.
 */
export const MessageImages = ({ messageId, canDelete, author, onReply }: MessageImagesProps) => {
    const { t } = useTranslation();
    const images = useChatImages(messageId);
    const removeImage = useChatImagesStore(s => s.removeImage);
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);
    const [pendingDelete, setPendingDelete] = useState<ChatImage | null>(null);
    const closeViewer = useCallback(() => setViewerIndex(null), []);

    if (images.length === 0) return null;

    const { tiles, overflow } = layoutImageGrid(images);
    const isSingle = images.length === 1;
    const ready = images.filter(image => !image.isUploading);

    const copy = (image: ChatImage) =>
        void copyImageToClipboard(image.url).then(
            () => toast({ description: t('chat.image.copied') }),
            () => toast({ variant: 'destructive', description: t('chat.image.copyFailed') })
        );
    const requestDelete = canDelete ? (image: ChatImage) => setPendingDelete(image) : undefined;

    return (
        <div className="mt-2 flex flex-col gap-2">
            {isSingle ? (
                <span className="truncate text-[13px] font-medium tracking-[-0.005em] text-placeholder">
                    {images[0].name}
                </span>
            ) : (
                <ImageSetMeta count={images.length} onDownloadAll={() => downloadImages(ready)} />
            )}
            <div
                className={cn(
                    'grid gap-2',
                    isSingle ? 'w-full max-w-[224px] grid-cols-1' : 'max-w-[456px] grid-cols-2'
                )}
            >
                {tiles.map((image, i) => {
                    const isLast = i === tiles.length - 1;
                    return (
                        <ImageTile
                            key={image.id}
                            image={image}
                            overflow={isLast ? overflow : 0}
                            onOpen={() => setViewerIndex(isLast && overflow > 0 ? i + 1 : i)}
                            onDownload={() => downloadImage(image)}
                            onCopy={() => copy(image)}
                            onDelete={requestDelete && (() => requestDelete(image))}
                        />
                    );
                })}
            </div>
            <ImageViewer
                images={images}
                openIndex={viewerIndex}
                onClose={closeViewer}
                author={author}
                onDownload={downloadImage}
                onDownloadAll={() => downloadImages(ready)}
                onCopy={copy}
                onDelete={requestDelete}
                onReply={onReply}
            />
            {pendingDelete && (
                <ConfirmDialog
                    open
                    onOpenChange={open => !open && setPendingDelete(null)}
                    title={t('chat.image.deleteConfirm.title')}
                    description={pendingDelete.name}
                    confirmLabel={t('chat.image.delete')}
                    variant="danger"
                    onConfirm={() => {
                        removeImage(messageId, pendingDelete.id);
                        setPendingDelete(null);
                    }}
                />
            )}
        </div>
    );
};
