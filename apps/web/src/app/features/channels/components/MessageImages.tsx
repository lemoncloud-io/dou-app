import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { chatMediaItems, isPendingUploadSlot, type DomainChat } from '@chatic/data';
import { cn } from '@chatic/ui-kit';
import { MediaViewer, MESSAGE_IMAGE_VISIBLE_MAX, MessageFileCard, MessageMediaTiles } from '@chatic/web-ui-kit';

import { useCachedImages, type CachedImage, type CachedImageRequest } from '../hooks/useCachedImages';
import { useFileDownloads } from '../hooks/useFileDownloads';
import { useImageAddressRefresh } from '../hooks/useImageAddressRefresh';
import { useImageExports, type ExportableMedia } from '../hooks/useImageExports';
import { imageCacheKey, type ImageVariant } from '../lib/imageCache';

import { SaveShareButtons } from './SaveShareButtons';

interface MessageImagesProps {
    uploads: DomainChat['upload$$'];
    /** The message's id and cloud, to read it again when its signed addresses have expired. */
    chatId?: string;
    cid: string;
    /** Which side the tiles hug — mine sit on the right like my bubbles. */
    align: 'start' | 'end';
}

/**
 * A chat message's attachments: its photos and videos as tiles in the order they were sent, the
 * full-screen viewer a tap opens, and its documents as cards below them. A video tile draws its poster
 * (or a plain panel) with a play mark; nothing plays in the feed, where every video would start a
 * request just by scrolling past.
 *
 * The addresses are signed and expire, and a cached row keeps them. An image that fails to load is
 * drawn as a placeholder and the message is read again for fresh addresses; the row then redraws from
 * the cache with them. A local preview of a message still on its way is never re-read.
 *
 * What is drawn comes through the image cache, keyed by upload rather than by address: a re-read hands
 * the same images new signed addresses, and without the cache every one of them was downloaded again.
 * Only what is drawn is asked for — the tiles in the row, and in the viewer the showing original with
 * its neighbours and their tiles as placeholders. The showing original leads: the neighbours' are
 * fetched only once it is in, or drawn from its address. An original is several megabytes, and fetched
 * side by side on a slow network the three of them split the bandwidth, so the photo being looked at
 * took three times as long. The signed
 * address stays what failure handling reasons about; a cached source that fails to decode is dropped
 * and the tile falls back to it.
 *
 * The viewer steps through the message's photos and videos — only the ones that can be opened, so a broken
 * tile is skipped rather than shown as a blank page. Its state is kept per row rather than lifted to
 * the page: only one row's viewer can be open at a time anyway, and a page-level viewer would need to
 * know which list every row belongs to. It holds a position, not an address, so a refresh reaches an
 * open viewer too.
 *
 * Inside an app that can, the viewer offers save and share for the showing image
 * (`SaveShareButtons`). They download the original through the shell, never the page's cached copy:
 * the cache may not hold the bytes at all when storage sends no CORS headers.
 */
export const MessageImages = ({ uploads, chatId, cid, align }: MessageImagesProps) => {
    const { t } = useTranslation();
    const refresh = useImageAddressRefresh();
    const exports = useImageExports({ cid, chatId });
    // Addresses seen to fail. A tile whose address is here draws as a placeholder until the re-read
    // brings a different one.
    const [dead, setDead] = useState<ReadonlySet<string>>(() => new Set());
    // Position in `viewable`, not a tile index.
    const [openAt, setOpenAt] = useState<number | null>(null);

    const split = useMemo(() => chatMediaItems(cid, uploads), [cid, uploads]);
    const files = useFileDownloads({ cid, chatId });
    // Tile positions are not `upload$$` positions once documents sit between them.
    const slotOf = (tile: number) => split.mediaSlots[tile];

    const tiles = useMemo(
        () =>
            split.media.map(item =>
                item.preview && dead.has(item.preview) ? { ...item, state: 'broken' as const } : item
            ),
        [split, dead]
    );

    // What the viewer can page through: photos and videos that are not broken and have an original to
    // open, with the tile each one came from.
    const viewable = tiles
        .map((tile, index) => ({ index, kind: tile.kind, src: tile.state === 'broken' ? undefined : tile.src }))
        .filter((item): item is { index: number; kind: 'image' | 'video'; src: string } => !!item.src);

    // The viewer's position, dropped when the list shrank under it — the same value closes the viewer,
    // so nothing is fetched for a viewer that is not showing.
    const openIndex = openAt !== null && openAt < viewable.length ? openAt : null;
    const nearOpen = (at: number) => openIndex !== null && Math.abs(at - openIndex) <= 1;
    // However the viewer went away — closed, or its images gone from under it — a share still
    // downloading must not open its sheet afterwards.
    const { stopOnClose } = exports;
    const viewerOpen = openIndex !== null;
    useEffect(() => {
        if (!viewerOpen) stopOnClose();
    }, [viewerOpen, stopOnClose]);
    // Tiles the viewer draws around the open image, to ask for their thumbnails as placeholders even
    // when they sit behind the "+n" tile.
    const around = new Set(viewable.filter((_, at) => nearOpen(at)).map(item => item.index));
    // A server head, never a local slot: a message still on its way has nothing to key or keep.
    const sentSlot = (tile: number) => {
        const slot = uploads?.[slotOf(tile)];
        return slot && !isPendingUploadSlot(slot) ? slot : undefined;
    };

    // The viewer's pages as the export sees them, in the same order.
    const exportables: ExportableMedia[] = viewable.map(item => {
        const slot = sentSlot(item.index);
        return {
            uploadId: slot?.id ?? `local-${item.index}`,
            // An item still on its way has only its page-local preview: not exportable.
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
            // The tile draws the original when the server made no thumbnail; keep it under that name.
            return requestFor(index, tile.preview, sentSlot(index)?.thumbUrl ? 'thumb' : 'org');
        })
    );
    const { images: originals, reject: rejectOriginal } = useCachedImages(
        // A video is streamed by the player from its address, never cached or fetched ahead.
        viewable.map((item, at) =>
            item.kind === 'image' && nearOpen(at)
                ? requestFor(item.index, item.src, sentSlot(item.index)?.orgUrl ? 'org' : 'thumb')
                : undefined
        ),
        openIndex ?? undefined
    );
    // What an image draws: nothing while it is looked up, then the kept copy or its signed address.
    const drawn = (image: CachedImage | undefined, fallback: string | undefined) =>
        !image ? fallback : image.status === 'pending' ? undefined : image.src;

    if (tiles.length === 0 && split.files.length === 0) return null;

    const reportDead = (src: string | undefined, index: number) => {
        const slot = uploads?.[slotOf(index)];
        if (!src || !slot || isPendingUploadSlot(slot)) return;
        setDead(previous => new Set(previous).add(src));
        if (chatId) void refresh({ cid, chatId, src });
    };

    return (
        <>
            {/* One column: the row's wrapper lays its children out in a row, which would set several
                document cards side by side and squeeze their names. */}
            <div
                className={cn('flex min-w-0 max-w-full flex-col gap-1', align === 'end' ? 'items-end' : 'items-start')}
            >
                {tiles.length > 0 && (
                    <MessageMediaTiles
                        items={tiles.map((tile, index) => ({ ...tile, preview: drawn(thumbs[index], tile.preview) }))}
                        onOpen={index => {
                            // A broken tile has nothing to open.
                            const at = viewable.findIndex(item => item.index === index);
                            if (at >= 0) setOpenAt(at);
                        }}
                        onImageError={index => {
                            if (!rejectThumb(index)) reportDead(tiles[index]?.preview, index);
                        }}
                        tileLabel={(position, kind) =>
                            t(kind === 'video' ? 'chat.attach.tileVideo' : 'chat.attach.tile', { position })
                        }
                        className={align === 'end' ? 'self-end' : 'self-start'}
                    />
                )}
                {split.files.map(file => {
                    const name = file.name ?? t('chat.attach.fileCard.fallbackName');
                    return (
                        <MessageFileCard
                            key={file.key}
                            name={file.name}
                            size={file.size}
                            state={file.state}
                            download={files.stateOf(file)}
                            progress={files.progressOf(file) ?? undefined}
                            onPress={() => void files.open(file)}
                            onDownload={() => void files.download(file)}
                            onCancel={() => files.cancel(file)}
                            onOpen={() => void files.open(file)}
                            labels={{
                                untitled: t('chat.attach.fileCard.fallbackName'),
                                download: t('chat.attach.fileCard.download', { name }),
                                cancel: t('chat.attach.fileCard.cancel', { name }),
                                open: t('chat.attach.fileCard.open', { name }),
                                unavailable: t('chat.attach.fileCard.unavailable'),
                                broken: t('chat.attach.fileCard.broken'),
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
                    preview: drawn(thumbs[item.index], undefined),
                    state: tiles[item.index]?.state === 'sending' ? ('sending' as const) : ('ready' as const),
                }))}
                index={openIndex}
                // The viewer only ever opens from a tile tap, which is what lets a video start playing.
                autoPlay
                onIndexChange={setOpenAt}
                onClose={() => setOpenAt(null)}
                renderFooter={
                    exports.canExport
                        ? at => {
                              const item = exportables[at];
                              if (!item || !exports.canExportItem(item)) return null;
                              const savable = exports.savable(exportables);
                              return (
                                  <SaveShareButtons
                                      item={item}
                                      busy={exports.busyFor(item.uploadId)}
                                      onAction={(action, target) => void exports.run(action, target)}
                                      saveAll={
                                          savable.length > 1
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
        </>
    );
};
