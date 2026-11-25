import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainChat } from '@chatic/runtime';
import { cn, toast } from '@chatic/ui-kit';

import { ConfirmDialog } from '../../../channels';
import { useChatImages, useFreshAddress, useImageAddressRefresh, useRunWithFreshAddress } from '../../hooks';
import { useChatImagesStore } from '../../stores';
import { copyImageToClipboard, downloadImage, downloadImages, layoutImageGrid, type ChatImage } from '../../utils';
import { useForwardFileStore } from './ForwardFileDialog';
import { ImageTile } from './ImageTile';
import { ImageSetMeta, ImageViewer, type ImageAuthor } from './ImageViewer';
import { useCopyMessageLink } from './useCopyMessageLink';

interface MessageImagesProps {
    message: DomainChat;
    canDelete: boolean;
    onDeleteMessage?: () => void;
    author: ImageAuthor;
    onReply?: () => void;
}

export const MessageImages = (props: MessageImagesProps) => {
    const images = useChatImages(props.message);
    return images.length > 0 ? <MessageImageGrid {...props} images={images} /> : null;
};

const MessageImageGrid = ({
    message,
    canDelete,
    onDeleteMessage,
    author,
    onReply,
    images,
}: MessageImagesProps & { images: ChatImage[] }) => {
    const { t } = useTranslation();
    const removeImage = useChatImagesStore(s => s.removeImage);
    const refreshAddress = useImageAddressRefresh();
    const freshAddress = useFreshAddress();
    const runWithFreshAddress = useRunWithFreshAddress();
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);
    const [pendingDelete, setPendingDelete] = useState<ChatImage | null>(null);
    const closeViewer = useCallback(() => setViewerIndex(null), []);

    const { tiles, overflow } = layoutImageGrid(images);
    const isSingle = images.length === 1;
    const ready = images.filter(image => !image.isUploading && !image.isFailed);
    const openViewerAt = (position: number) => {
        const index = ready.findIndex(image => images.indexOf(image) >= position);
        if (index !== -1) setViewerIndex(index);
    };

    const withFreshAddress = <T,>(image: ChatImage, run: (url: string) => Promise<T>) =>
        runWithFreshAddress({ chatId: message.id, id: image.id, url: image.url }, run);
    const save = (image: ChatImage) => withFreshAddress(image, url => downloadImage({ name: image.name, url }));

    const copy = (image: ChatImage) =>
        void withFreshAddress(image, copyImageToClipboard).then(
            () => toast({ description: t('chat.image.copied') }),
            () => toast({ variant: 'destructive', description: t('chat.image.copyFailed') })
        );
    const downloadFailed = () => toast({ variant: 'destructive', description: t('chat.image.downloadFailed') });
    const download = (image: ChatImage) => void save(image).catch(downloadFailed);
    const deletesMessage = !!message.upload$$?.length;
    const canDeleteHere = canDelete && (!deletesMessage || !!onDeleteMessage);
    const requestDelete = canDeleteHere ? (image: ChatImage) => setPendingDelete(image) : undefined;
    const copyLink = useCopyMessageLink(message);
    const openForward = useForwardFileStore(s => s.open);
    const forward = deletesMessage
        ? (image: ChatImage) =>
              openForward({
                  url: image.url,
                  name: image.name,
                  refreshUrl: () => freshAddress(message.id, image.id),
              })
        : undefined;

    return (
        <div className="mt-2 flex flex-col gap-2">
            {isSingle ? (
                <span className="truncate text-caption font-medium text-muted-foreground">{images[0].name}</span>
            ) : (
                <ImageSetMeta count={images.length} onDownloadAll={() => downloadImages(ready, downloadFailed, save)} />
            )}
            <div
                className={cn(
                    'grid gap-2',
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
                            onReply={onReply}
                            onCopyLink={copyLink}
                            onForward={forward && (() => forward(image))}
                            onLoadError={src => void refreshAddress(message.id, src)}
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
                onDownloadAll={() => downloadImages(ready, downloadFailed, save)}
                onCopy={copy}
                onDelete={requestDelete}
                onReply={onReply}
                onLoadError={src => void refreshAddress(message.id, src)}
            />
            {pendingDelete && (
                <ConfirmDialog
                    open
                    onOpenChange={open => !open && setPendingDelete(null)}
                    title={t(deletesMessage ? 'chat.deleteConfirm.title' : 'chat.image.deleteConfirm.title')}
                    description={deletesMessage ? t('chat.deleteConfirm.noPreview') : pendingDelete.name}
                    confirmLabel={t('chat.image.delete')}
                    variant="danger"
                    onConfirm={() => {
                        setPendingDelete(null);
                        setViewerIndex(null);
                        if (deletesMessage) onDeleteMessage?.();
                        else if (message.id) removeImage(message.id, pendingDelete.id);
                    }}
                />
            )}
        </div>
    );
};
