import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainChat } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { ConfirmDialog } from '../../../channels';
import { useChatImages } from '../../hooks';
import { useChatImagesStore } from '../../stores';
import { copyImageToClipboard, downloadImage, downloadImages, layoutImageGrid, type ChatImage } from '../../utils';
import { ImageTile } from './ImageTile';
import { ImageSetMeta, ImageViewer, type ImageAuthor } from './ImageViewer';

interface MessageImagesProps {
    /** The message the images belong to — its images are read from it. */
    message: DomainChat;
    /** "Delete file" is offered on your own messages only (and only on the debug samples — there is no server delete yet). */
    canDelete: boolean;
    author: ImageAuthor;
    /** Open this message's thread (the viewer's "Reply"). Absent inside the thread panel. */
    onReply?: () => void;
}

/**
 * A message's images (Figma "#image upload case").
 *
 * One image: its file name, then the image. Several: "n files · Download all", then a
 * two-column grid of up to four with the fourth counting the rest ("+n"). Any tile opens
 * the viewer on that image; the "+n" tile opens it on the first hidden one.
 */
export const MessageImages = (props: MessageImagesProps) => {
    const images = useChatImages(props.message);
    // Every feed row mounts this, and almost none carry images: stop at the store lookup
    // so the grid's viewer and delete state exist only where there is something to show.
    return images.length > 0 ? <MessageImageGrid {...props} images={images} /> : null;
};

const MessageImageGrid = ({
    message,
    canDelete,
    author,
    onReply,
    images,
}: MessageImagesProps & { images: ChatImage[] }) => {
    const { t } = useTranslation();
    const removeImage = useChatImagesStore(s => s.removeImage);
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);
    const [pendingDelete, setPendingDelete] = useState<ChatImage | null>(null);
    const closeViewer = useCallback(() => setViewerIndex(null), []);

    const { tiles, overflow } = layoutImageGrid(images);
    const isSingle = images.length === 1;
    const ready = images.filter(image => !image.isUploading && !image.isFailed);
    // The viewer, the saves and the copy only ever see images there is something to load for. A tile
    // points at its place among all the images, so it opens the first loadable one from there.
    const openViewerAt = (position: number) => {
        const index = ready.findIndex(image => images.indexOf(image) >= position);
        if (index !== -1) setViewerIndex(index);
    };

    const copy = (image: ChatImage) =>
        void copyImageToClipboard(image.url).then(
            () => toast({ description: t('chat.image.copied') }),
            () => toast({ variant: 'destructive', description: t('chat.image.copyFailed') })
        );
    const downloadFailed = () => toast({ variant: 'destructive', description: t('chat.image.downloadFailed') });
    const download = (image: ChatImage) => void downloadImage(image).catch(downloadFailed);
    // "Delete file" writes to the debug sample store only: a message's own uploads have no delete yet.
    const canDeleteHere = canDelete && !message.upload$$?.length;
    const requestDelete = canDeleteHere ? (image: ChatImage) => setPendingDelete(image) : undefined;

    return (
        <div className="mt-2 flex flex-col gap-2">
            {isSingle ? (
                <span className="truncate text-caption font-medium text-muted-foreground">{images[0].name}</span>
            ) : (
                <ImageSetMeta count={images.length} onDownloadAll={() => downloadImages(ready, downloadFailed)} />
            )}
            <div
                className={cn(
                    'grid gap-2',
                    // 180px tiles: at 222px four images took most of a laptop-height feed.
                    isSingle ? 'w-full max-w-[180px] grid-cols-1' : 'max-w-[368px] grid-cols-2'
                )}
            >
                {tiles.map((image, i) => {
                    const isLast = i === tiles.length - 1;
                    return (
                        <ImageTile
                            key={image.id}
                            image={image}
                            overflow={isLast ? overflow : 0}
                            onOpen={() => openViewerAt(isLast && overflow > 0 ? i + 1 : i)}
                            onDownload={() => download(image)}
                            onCopy={() => copy(image)}
                            onDelete={requestDelete && (() => requestDelete(image))}
                        />
                    );
                })}
            </div>
            <ImageViewer
                images={ready}
                openIndex={viewerIndex}
                onClose={closeViewer}
                author={author}
                onDownload={download}
                onDownloadAll={() => downloadImages(ready, downloadFailed)}
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
                        if (message.id) removeImage(message.id, pendingDelete.id);
                        setPendingDelete(null);
                    }}
                />
            )}
        </div>
    );
};
