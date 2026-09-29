import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainChat } from '@chatic/data';
import { ImageViewer, MessageImageTiles } from '@chatic/web-ui-kit';

import { imageOriginalAt, toImageTiles } from '../utils/imageTiles';

interface MessageImagesProps {
    uploads: DomainChat['upload$$'];
    /** Which side the tiles hug — mine sit on the right like my bubbles. */
    align: 'start' | 'end';
}

/**
 * A chat message's images: the tiles in the row, and the full-screen viewer a tap opens.
 *
 * The viewer's state is kept per row rather than lifted to the page: only one row's viewer can be
 * open at a time anyway, and a page-level viewer would need to know which list and index every row
 * belongs to.
 */
export const MessageImages = ({ uploads, align }: MessageImagesProps) => {
    const { t } = useTranslation();
    const tiles = useMemo(() => toImageTiles(uploads), [uploads]);
    const [open, setOpen] = useState<string | null>(null);

    if (tiles.length === 0) return null;

    return (
        <>
            <MessageImageTiles
                items={tiles}
                onOpen={index => {
                    // A broken tile has nothing to open.
                    if (tiles[index]?.state === 'broken') return;
                    setOpen(imageOriginalAt(uploads, index) ?? null);
                }}
                tileLabel={position => t('chat.attach.tile', { position })}
                className={align === 'end' ? 'self-end' : 'self-start'}
            />
            <ImageViewer
                src={open}
                onClose={() => setOpen(null)}
                title={t('chat.attach.viewer')}
                closeLabel={t('chat.attach.viewerClose')}
            />
        </>
    );
};
