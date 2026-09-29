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
 * The viewer's state is kept per row rather than lifted to the page: only one row's viewer can be
 * open at a time anyway, and a page-level viewer would need to know which list and index every row
 * belongs to. It holds the index, not the address, so a refresh reaches an open viewer too.
 */
export const MessageImages = ({ uploads, chatId, cid, align }: MessageImagesProps) => {
    const { t } = useTranslation();
    const refresh = useImageAddressRefresh();
    // Addresses seen to fail. A tile whose address is here draws as a placeholder until the re-read
    // brings a different one.
    const [dead, setDead] = useState<ReadonlySet<string>>(() => new Set());
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const tiles = useMemo(
        () =>
            toImageTiles(uploads).map(tile =>
                tile.src && dead.has(tile.src) ? { ...tile, state: 'broken' as const } : tile
            ),
        [uploads, dead]
    );

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
                    if (tiles[index]?.state === 'broken') return;
                    setOpenIndex(index);
                }}
                onImageError={index => reportDead(tiles[index]?.src, index)}
                tileLabel={position => t('chat.attach.tile', { position })}
                className={align === 'end' ? 'self-end' : 'self-start'}
            />
            <ImageViewer
                src={openIndex === null ? null : (imageOriginalAt(uploads, openIndex) ?? null)}
                onClose={() => setOpenIndex(null)}
                onError={() => {
                    if (openIndex === null) return;
                    const slot = uploads?.[openIndex];
                    if (!chatId || !slot || isPendingUploadSlot(slot)) return;
                    const src = imageOriginalAt(uploads, openIndex);
                    if (src) void refresh({ cid, chatId, src });
                }}
                title={t('chat.attach.viewer')}
                closeLabel={t('chat.attach.viewerClose')}
            />
        </>
    );
};
