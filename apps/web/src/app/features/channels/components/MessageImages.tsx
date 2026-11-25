import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime, chatMediaItems, isPendingUploadSlot, type DomainChat } from '@chatic/runtime-react';
import { cn } from '@chatic/ui-kit';
import { MediaViewer, MESSAGE_IMAGE_VISIBLE_MAX, MessageFileCard, MessageMediaTiles } from '@chatic/web-ui-kit';

import { useCachedImages, type CachedImage, type CachedImageRequest } from '../hooks/useCachedImages';
import { useFileDownloads } from '../hooks/useFileDownloads';
import { useImageAddressRefresh } from '../hooks/useImageAddressRefresh';
import { useImageExports, type ExportableMedia } from '../hooks/useImageExports';
import { useInView } from '../hooks/useInView';
import { useVideoFrames } from '../hooks/useVideoFrames';
import { imageCacheKey, type ImageVariant } from '../lib/imageCache';

import { DocumentPreview, type DocumentPreviewTarget } from './DocumentPreview';
import { MessageAudioBubble, type AudioMessageContext } from './MessageAudioBubble';
import { SaveShareButtons } from './SaveShareButtons';

interface MessageImagesProps {
    uploads: DomainChat['upload$$'];
    chatId?: string;
    cid: string;
    align: 'start' | 'end';
    audio?: AudioMessageContext;
    hiddenSlots?: ReadonlySet<number>;
}

export const MessageImages = ({ uploads: allUploads, chatId, cid, align, audio, hiddenSlots }: MessageImagesProps) => {
    const { t } = useTranslation();
    const refresh = useImageAddressRefresh();
    const exports = useImageExports({ cid, chatId });
    const [dead, setDead] = useState<ReadonlySet<string>>(() => new Set());
    const [openAt, setOpenAt] = useState<number | null>(null);

    const { uploads, slotPositions } = useMemo(() => {
        const positions = (allUploads ?? []).map((_, index) => index);
        if (!hiddenSlots?.size || !allUploads) return { uploads: allUploads, slotPositions: positions };
        const kept = positions.filter(index => !hiddenSlots.has(index));
        return { uploads: kept.map(index => allUploads[index]!), slotPositions: kept };
    }, [allUploads, hiddenSlots]);
    const split = useMemo(() => chatMediaItems(cid, uploads), [cid, uploads]);
    const [previewing, setPreviewing] = useState<DocumentPreviewTarget | null>(null);
    const files = useFileDownloads({ cid, chatId, onPreview: (file, from) => setPreviewing({ file, chatId: from }) });
    const sendProgress = runtime.data.useImageSendProgress(chatId);
    const slotOf = (tile: number) => split.mediaSlots[tile];

    const tiles = useMemo(
        () =>
            split.media.map(item =>
                item.preview && dead.has(item.preview) ? { ...item, state: 'broken' as const } : item
            ),
        [split, dead]
    );

    const viewable = tiles
        .map((tile, index) => ({ index, kind: tile.kind, src: tile.state === 'broken' ? undefined : tile.src }))
        .filter((item): item is { index: number; kind: 'image' | 'video'; src: string } => !!item.src);

    const openIndex = openAt !== null && openAt < viewable.length ? openAt : null;
    const nearOpen = (at: number) => openIndex !== null && Math.abs(at - openIndex) <= 1;
    const { stopOnClose } = exports;
    const viewerOpen = openIndex !== null;
    useEffect(() => {
        if (!viewerOpen) stopOnClose();
    }, [viewerOpen, stopOnClose]);
    const around = new Set(viewable.filter((_, at) => nearOpen(at)).map(item => item.index));
    const sentSlot = (tile: number) => {
        const slot = uploads?.[slotOf(tile)];
        return slot && !isPendingUploadSlot(slot) ? slot : undefined;
    };

    const exportables: ExportableMedia[] = viewable.map(item => {
        const slot = sentSlot(item.index);
        return {
            uploadId: slot?.id ?? `local-${item.index}`,
            url: slot ? item.src : undefined,
            name: slot?.name,
            kind: item.kind,
        };
    });

    const requestFor = (index: number, url: string | undefined, variant: ImageVariant) => {
        const slot = sentSlot(index);
        if (!url || !slot?.id) return undefined;
        return { key: imageCacheKey(cid, slot.id, variant), variant, url } satisfies CachedImageRequest;
    };
    const { images: thumbs, reject: rejectThumb } = useCachedImages(
        tiles.map((tile, index) => {
            if (tile.state !== 'ready' || (index >= MESSAGE_IMAGE_VISIBLE_MAX && !around.has(index))) return undefined;
            return requestFor(index, tile.preview, sentSlot(index)?.thumbUrl ? 'thumb' : 'org');
        })
    );
    const { images: originals, reject: rejectOriginal } = useCachedImages(
        viewable.map((item, at) =>
            item.kind === 'image' && nearOpen(at)
                ? requestFor(item.index, item.src, sentSlot(item.index)?.orgUrl ? 'org' : 'thumb')
                : undefined
        ),
        openIndex ?? undefined
    );
    const drawn = (image: CachedImage | undefined, fallback: string | undefined) =>
        !image ? fallback : image.status === 'pending' ? undefined : image.src;

    const [tilesRef, onScreen] = useInView();
    const frames = useVideoFrames(
        tiles.map((tile, index) => {
            const slot = sentSlot(index);
            if (tile.kind !== 'video' || tile.state !== 'ready' || !tile.src || !slot?.id || slot.thumbUrl) {
                return undefined;
            }
            if (index >= MESSAGE_IMAGE_VISIBLE_MAX) return undefined;
            return { key: imageCacheKey(cid, slot.id, 'frame'), url: tile.src };
        }),
        onScreen
    );
    const frameImage = (index: number) => {
        const frame = frames[index];
        return frame?.status === 'image' ? frame.src : undefined;
    };

    if (tiles.length === 0 && split.files.length === 0) return null;

    const reportDead = (src: string | undefined, index: number) => {
        const slot = uploads?.[slotOf(index)];
        if (!src || !slot || isPendingUploadSlot(slot)) return;
        setDead(previous => new Set(previous).add(src));
        if (chatId) void refresh({ cid, chatId, src });
    };

    return (
        <>
            <div
                className={cn('flex min-w-0 max-w-full flex-col gap-1', align === 'end' ? 'items-end' : 'items-start')}
            >
                {tiles.length > 0 && (
                    <MessageMediaTiles
                        ref={tilesRef}
                        items={tiles.map((tile, index) => {
                            const frame = frames[index];
                            const progress = tile.state === 'sending' ? sendProgress?.[slotOf(index)] : undefined;
                            return {
                                ...tile,
                                preview: drawn(thumbs[index], tile.preview) ?? frameImage(index),
                                ...(frame?.status === 'element' ? { frameUrl: frame.url } : {}),
                                ...(progress !== undefined ? { progress } : {}),
                            };
                        })}
                        onOpen={index => {
                            const at = viewable.findIndex(item => item.index === index);
                            if (at >= 0) setOpenAt(at);
                        }}
                        onImageError={index => {
                            if (!rejectThumb(index)) reportDead(tiles[index]?.preview, index);
                        }}
                        tileLabel={(position, kind) =>
                            t(kind === 'video' ? 'chat.attach.tileVideo' : 'chat.attach.tile', { position })
                        }
                        sendingLabel={t('chat.attach.sending')}
                        className={align === 'end' ? 'self-end' : 'self-start'}
                    />
                )}
                {split.files.map((file, at) => {
                    if (file.audio) {
                        const slot = split.fileSlots[at] ?? at;
                        return (
                            <MessageAudioBubble
                                key={file.key}
                                file={file}
                                idx={slotPositions[slot] ?? slot}
                                cid={cid}
                                chatId={chatId}
                                sendProgress={
                                    file.state === 'sending' ? sendProgress?.[slotPositions[slot] ?? slot] : undefined
                                }
                                context={audio ?? { mine: align === 'end', channelId: '' }}
                                className={align === 'end' ? 'self-end' : 'self-start'}
                            />
                        );
                    }
                    const name = file.name ?? t('chat.attach.fileCard.fallbackName');
                    const sent = file.state === 'sending' ? sendProgress?.[split.fileSlots[at]] : undefined;
                    return (
                        <MessageFileCard
                            key={file.key}
                            name={file.name}
                            size={file.size}
                            state={file.state}
                            download={files.stateOf(file)}
                            progress={file.state === 'sending' ? sent : (files.progressOf(file) ?? undefined)}
                            onPress={() => void files.open(file)}
                            onDownload={() => void files.download(file)}
                            onCancel={() => files.cancel(file)}
                            onOpen={() => void files.open(file)}
                            labels={{
                                untitled: t('chat.attach.fileCard.fallbackName'),
                                download: t('chat.attach.fileCard.download', { name }),
                                cancel: t('chat.attach.fileCard.cancel', { name }),
                                open: t('chat.attach.fileCard.open', { name }),
                                broken: t('chat.attach.fileCard.broken'),
                                sending: t('chat.attach.sending'),
                            }}
                            className={align === 'end' ? 'self-end' : 'self-start'}
                        />
                    );
                })}
            </div>
            <MediaViewer
                items={viewable.map((item, at) => ({
                    key: tiles[item.index]?.key ?? `tile-${item.index}`,
                    kind: item.kind,
                    src: item.kind === 'image' ? drawn(originals[at], item.src) : item.src,
                    preview: drawn(thumbs[item.index], undefined) ?? frameImage(item.index),
                    state: tiles[item.index]?.state === 'sending' ? ('sending' as const) : ('ready' as const),
                }))}
                index={openIndex}
                autoPlay
                onIndexChange={setOpenAt}
                onClose={() => setOpenAt(null)}
                renderFooter={
                    exports.canExport
                        ? at => {
                              const item = exportables[at];
                              if (!item) return null;
                              const savable = exports.savable(exportables);
                              return (
                                  <SaveShareButtons
                                      item={item}
                                      busy={exports.busyFor(item.uploadId)}
                                      onAction={(action, target) => void exports.run(action, target)}
                                      canShare={exports.canShare}
                                      saveAll={
                                          exports.canSaveAll && savable.length > 1
                                              ? {
                                                    count: savable.length,
                                                    videos: savable.some(entry => entry.kind === 'video'),
                                                    onSaveAll: () => void exports.runAll(savable),
                                                }
                                              : undefined
                                      }
                                  />
                              );
                          }
                        : undefined
                }
                onError={at => {
                    if (rejectOriginal(at)) return;
                    const item = viewable[at];
                    const slot = item ? uploads?.[slotOf(item.index)] : undefined;
                    if (!item || !chatId || !slot || isPendingUploadSlot(slot)) return;
                    void refresh({ cid, chatId, src: item.src });
                }}
                labels={{
                    title: t('chat.attach.viewer'),
                    close: t('chat.attach.viewerClose'),
                    previous: t('chat.attach.viewerPrevious'),
                    next: t('chat.attach.viewerNext'),
                    play: t('chat.attach.viewerPlay'),
                }}
            />
            {split.files.length > 0 && (
                <DocumentPreview cid={cid} target={previewing} onClose={() => setPreviewing(null)} />
            )}
        </>
    );
};
