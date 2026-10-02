import * as React from 'react';

import { IconFileCheck, IconGalleryWide } from '../../resources/icons';
import { BottomSheet } from '../overlay/BottomSheet';

export interface AttachSourceSheetLabels {
    album: string;
    files: string;
}

export interface AttachSourceSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The sheet's title, drawn above the sources and used as its accessible name. */
    title?: string;
    /** Photos and videos from the device's library. */
    onAlbum: () => void;
    /** Documents from the device's file browser. */
    onFiles: () => void;
    labels?: Partial<AttachSourceSheetLabels>;
    /**
     * One line under the two sources, for what this device cannot send from here — an iOS browser or
     * an app built before the shell could pick videos takes photos only from the album, and says so
     * here rather than letting a picked video fail after a long silence. Omit when there is nothing to
     * say.
     */
    notice?: React.ReactNode;
}

const DEFAULT_LABELS: AttachSourceSheetLabels = { album: 'From album', files: 'From files' };

interface SourceRowProps {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
}

/** One source (Figma `3749:29688`): a 48px circle on the light control surface, then the label. */
const SourceRow = ({ icon, label, onClick }: SourceRowProps) => (
    <div className="w-full px-3">
        <button
            type="button"
            onClick={onClick}
            className="flex w-full items-center gap-3 py-2 pl-1 pr-1.5 text-left transition-opacity active:opacity-70"
        >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-control-surface">
                {icon}
            </span>
            <span className="min-w-0 flex-1 truncate text-[16px] font-medium leading-[1.294] tracking-[-0.08px] text-foreground">
                {label}
            </span>
        </button>
    </div>
);

/**
 * The second step of the attach menu's files entry: where the file comes from — the file browser
 * (documents) or the album (photos and videos, mixed). Two sources rather than one picker because the
 * systems' own pickers split them the same way: the photo library picker cannot reach a PDF, and the
 * document browser does not show the library.
 *
 * Figma `3749:29651`: a titled list rather than the attach menu's row of tiles. The sources are
 * phrases, not single words, and a list keeps each one readable at any length; the title says which
 * entry of the menu this narrows. The sheet edge (rounded top, shadow) still matches the menu's, so
 * the step reads as the same surface. The title is drawn in the body rather than through the sheet's
 * own header, which sets a larger type and a glass band the design does not have.
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
            <div className="flex flex-col pb-8">
                {/* The sheet's accessible name is the hidden header title; this copy is for the eye. */}
                <p
                    aria-hidden
                    className="truncate px-4 py-3.5 text-[16px] font-semibold leading-[1.5] tracking-[-0.08px] text-foreground"
                >
                    {title}
                </p>
                <div className="flex flex-col gap-2">
                    <SourceRow
                        icon={<IconFileCheck className="text-glyph-cyan" />}
                        label={text.files}
                        onClick={onFiles}
                    />
                    <SourceRow
                        icon={<IconGalleryWide className="text-glyph-green" />}
                        label={text.album}
                        onClick={onAlbum}
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
