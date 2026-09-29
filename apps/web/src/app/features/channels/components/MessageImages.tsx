import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isPendingUploadSlot, type DomainChat } from '@chatic/data';
import { ImageViewer, MessageImageTiles } from '@chatic/web-ui-kit';

import { useImageAddressRefresh } from '../hooks/useImageAddressRefresh';
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
                items={tiles}
                onOpen={index => {
                    // A broken tile has nothing to open.
                    const at = viewable.findIndex(item => item.index === index);
                    if (at >= 0) setOpenAt(at);
                }}
                onImageError={index => reportDead(tiles[index]?.src, index)}
                tileLabel={position => t('chat.attach.tile', { position })}
                className={align === 'end' ? 'self-end' : 'self-start'}
            />
            <ImageViewer
                images={viewable.map(item => item.src)}
                index={openAt !== null && openAt < viewable.length ? openAt : null}
                onIndexChange={setOpenAt}
                onClose={() => setOpenAt(null)}
                onError={at => {
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
