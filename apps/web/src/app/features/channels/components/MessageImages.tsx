import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isPendingUploadSlot, type DomainChat } from '@chatic/data';
import { ImageViewer, MESSAGE_IMAGE_VISIBLE_MAX, MessageImageTiles } from '@chatic/web-ui-kit';

import { useCachedImages, type CachedImage, type CachedImageRequest } from '../hooks/useCachedImages';
import { useImageAddressRefresh } from '../hooks/useImageAddressRefresh';
import { imageCacheKey, type ImageVariant } from '../lib/imageCache';
import { imageOriginalAt, toImageTiles } from '../utils/imageTiles';

interface MessageImagesProps {
    uploads: DomainChat['upload$$'];
    /** The message's id and cloud, to read it again when its signed addresses have expired. */
    chatId?: string;
    cid: string;
    /** Which side the tiles hug — mine sit on the right like my bubbles. */
    align: 'start' | 'end';
}

/**
 * A chat message's images: the tiles in the row, and the full-screen viewer a tap opens.
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
 * The viewer steps through the message's images — only the ones that can be opened, so a broken
 * tile is skipped rather than shown as a blank page. Its state is kept per row rather than lifted to
 * the page: only one row's viewer can be open at a time anyway, and a page-level viewer would need to
 * know which list every row belongs to. It holds a position, not an address, so a refresh reaches an
 * open viewer too.
 */
export const MessageImages = ({ uploads, chatId, cid, align }: MessageImagesProps) => {
    const { t } = useTranslation();
    const refresh = useImageAddressRefresh();
    // Addresses seen to fail. A tile whose address is here draws as a placeholder until the re-read
    // brings a different one.
    const [dead, setDead] = useState<ReadonlySet<string>>(() => new Set());
    // Position in `viewable`, not a tile index.
    const [openAt, setOpenAt] = useState<number | null>(null);

    const tiles = useMemo(
        () =>
            toImageTiles(uploads).map(tile =>
                tile.src && dead.has(tile.src) ? { ...tile, state: 'broken' as const } : tile
            ),
        [uploads, dead]
    );

    // What the viewer can page through: tiles that are not broken and have an original to open, with
    // the tile each one came from.
    const viewable = tiles
        .map((tile, index) => ({ index, src: tile.state === 'broken' ? undefined : imageOriginalAt(uploads, index) }))
        .filter((item): item is { index: number; src: string } => !!item.src);

    // The viewer's position, dropped when the list shrank under it — the same value closes the viewer,
    // so nothing is fetched for a viewer that is not showing.
    const openIndex = openAt !== null && openAt < viewable.length ? openAt : null;
    const nearOpen = (at: number) => openIndex !== null && Math.abs(at - openIndex) <= 1;
    // Tiles the viewer draws around the open image, to ask for their thumbnails as placeholders even
    // when they sit behind the "+n" tile.
    const around = new Set(viewable.filter((_, at) => nearOpen(at)).map(item => item.index));
    // A server head, never a local slot: a message still on its way has nothing to key or keep.
    const sentSlot = (index: number) => {
        const slot = uploads?.[index];
        return slot && !isPendingUploadSlot(slot) ? slot : undefined;
    };
    const requestFor = (index: number, url: string | undefined, variant: ImageVariant) => {
        const slot = sentSlot(index);
        if (!url || !slot?.id) return undefined;
        return { key: imageCacheKey(cid, slot.id, variant), variant, url } satisfies CachedImageRequest;
    };
    const { images: thumbs, reject: rejectThumb } = useCachedImages(
        tiles.map((tile, index) => {
            if (tile.state !== 'ready' || (index >= MESSAGE_IMAGE_VISIBLE_MAX && !around.has(index))) return undefined;
            // The tile draws the original when the server made no thumbnail; keep it under that name.
            return requestFor(index, tile.src, sentSlot(index)?.thumbUrl ? 'thumb' : 'org');
        })
    );
    const { images: originals, reject: rejectOriginal } = useCachedImages(
        viewable.map((item, at) =>
            nearOpen(at) ? requestFor(item.index, item.src, sentSlot(item.index)?.orgUrl ? 'org' : 'thumb') : undefined
        ),
        openIndex ?? undefined
    );
    // What an image draws: nothing while it is looked up, then the kept copy or its signed address.
    const drawn = (image: CachedImage | undefined, fallback: string | undefined) =>
        !image ? fallback : image.status === 'pending' ? undefined : image.src;

    if (tiles.length === 0) return null;

    const reportDead = (src: string | undefined, index: number) => {
        const slot = uploads?.[index];
        if (!src || !slot || isPendingUploadSlot(slot)) return;
        setDead(previous => new Set(previous).add(src));
        if (chatId) void refresh({ cid, chatId, src });
    };

    return (
        <>
            <MessageImageTiles
                items={tiles.map((tile, index) => ({ ...tile, src: drawn(thumbs[index], tile.src) }))}
                onOpen={index => {
                    // A broken tile has nothing to open.
                    const at = viewable.findIndex(item => item.index === index);
                    if (at >= 0) setOpenAt(at);
                }}
                onImageError={index => {
                    if (!rejectThumb(index)) reportDead(tiles[index]?.src, index);
                }}
                tileLabel={position => t('chat.attach.tile', { position })}
                className={align === 'end' ? 'self-end' : 'self-start'}
            />
            <ImageViewer
                images={viewable.map((item, at) => drawn(originals[at], item.src))}
                placeholders={viewable.map(item => drawn(thumbs[item.index], undefined))}
                index={openIndex}
                onIndexChange={setOpenAt}
                onClose={() => setOpenAt(null)}
                onError={at => {
                    if (rejectOriginal(at)) return;
                    const item = viewable[at];
                    const slot = item ? uploads?.[item.index] : undefined;
                    if (!item || !chatId || !slot || isPendingUploadSlot(slot)) return;
                    void refresh({ cid, chatId, src: item.src });
                }}
                title={t('chat.attach.viewer')}
                closeLabel={t('chat.attach.viewerClose')}
                previousLabel={t('chat.attach.viewerPrevious')}
                nextLabel={t('chat.attach.viewerNext')}
            />
        </>
    );
};
