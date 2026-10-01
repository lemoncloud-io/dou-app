import * as React from 'react';

import { IconFileSolid, IconGalleryWideSolid } from '../../resources/icons';
import { BottomSheet } from '../overlay/BottomSheet';
import { AttachActionTile } from './AttachActionTile';

export interface AttachSourceSheetLabels {
    album: string;
    files: string;
}

export interface AttachSourceSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Accessible name of the sheet. Not drawn — like the attach menu it follows, it has no title bar. */
    title?: string;
    /** Photos and videos from the device's library. */
    onAlbum: () => void;
    /** Documents from the device's file browser. */
    onFiles: () => void;
    labels?: Partial<AttachSourceSheetLabels>;
    /**
     * One line under the two entries, for what this device cannot send from here — an iOS browser or
     * an app built before the shell could pick videos takes photos only from the album, and says so
     * here rather than letting a picked video fail after a long silence. Omit when there is nothing to
     * say.
     */
    notice?: React.ReactNode;
}

const DEFAULT_LABELS: AttachSourceSheetLabels = { album: 'From album', files: 'From files' };

/**
 * The second step of the attach menu's files entry: where the file comes from — the album (photos
 * and videos, mixed) or the file browser (documents). Two sources rather than one picker because the
 * systems' own pickers split them the same way: the photo library picker cannot reach a PDF, and the
 * document browser does not show the library.
 *
 * Drawn as the attach menu is — the same sheet, the same circular tiles and glyph colours — so the
 * second step reads as the first one narrowing, not as a different surface. The tiles are wider than
 * the menu's: their labels are phrases, not single words.
 *
 * Stateless: what each entry opens is the host's.
 */
export const AttachSourceSheet = ({
    open,
    onOpenChange,
    title = 'Attach a file',
    onAlbum,
    onFiles,
    labels,
    notice,
}: AttachSourceSheetProps) => {
    const text = { ...DEFAULT_LABELS, ...labels };
    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={title}
            hideHeader
            className="rounded-t-[20px] shadow-[0_-2px_6px_rgba(0,0,0,0.12)]"
        >
            <div className="flex flex-col items-center gap-1 pb-8">
                <div className="flex w-full justify-center gap-6 pt-6">
                    <AttachActionTile
                        icon={<IconGalleryWideSolid className="text-glyph-green" />}
                        label={text.album}
                        onClick={onAlbum}
                        className="w-[128px]"
                    />
                    <AttachActionTile
                        icon={<IconFileSolid className="text-glyph-cyan" />}
                        label={text.files}
                        onClick={onFiles}
                        className="w-[128px]"
                    />
                </div>
                {notice && (
                    <p className="w-full truncate px-5 pt-3 text-center text-[13px] leading-[1.4] tracking-[-0.065px] text-description">
                        {notice}
                    </p>
                )}
            </div>
        </BottomSheet>
    );
};
