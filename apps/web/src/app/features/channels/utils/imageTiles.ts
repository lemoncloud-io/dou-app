import { isPendingUploadSlot, type DomainChat } from '@chatic/data';
import type { MessageImageTileItem } from '@chatic/web-ui-kit';

type UploadList = NonNullable<DomainChat['upload$$']>;

/**
 * A chat's `upload$$` as the tiles the row draws, in the order the sender picked them.
 *
 * The list holds two kinds of entry. A message still on its way carries local slots
 * (`localStatus` + an object-URL preview); a sent one carries the server's heads, whose addresses
 * are signed at read time and may be missing. A head the server marks failed, or that came back
 * with an error or no address at all, stays as a broken tile: the sender picked it, so the count
 * must still say so.
 */
export const toImageTiles = (uploads: UploadList | null | undefined): MessageImageTileItem[] =>
    (uploads ?? []).map((slot, index) => {
        if (isPendingUploadSlot(slot)) {
            return { key: `local-${index}`, src: slot.localThumbUrl, state: slot.localStatus };
        }
        const src = slot.thumbUrl ?? slot.orgUrl;
        const broken = slot.status === 'failed' || !!slot.error || !src;
        return { key: slot.id ?? `upload-${index}`, src, state: broken ? 'broken' : 'ready' };
    });

/**
 * The full-size address to open a tapped tile at — the original for a sent image, the local preview
 * (which is the original file) while it is still on its way. Undefined when there is nothing to show.
 */
export const imageOriginalAt = (uploads: UploadList | null | undefined, index: number): string | undefined => {
    const slot = uploads?.[index];
    if (!slot) return undefined;
    if (isPendingUploadSlot(slot)) return slot.localThumbUrl;
    return slot.orgUrl ?? slot.thumbUrl;
};

/** Whether the row is an image message still owned by this page's send — the one retry can reach. */
export const isPendingImageChat = (chat: Pick<DomainChat, 'upload$$'>): boolean =>
    !!chat.upload$$?.some(isPendingUploadSlot);
