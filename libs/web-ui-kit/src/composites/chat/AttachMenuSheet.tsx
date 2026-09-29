import * as React from 'react';

import { IconCameraSolid, IconFileSolid, IconGalleryWideSolid } from '../../resources/icons';
import { BottomSheet } from '../overlay/BottomSheet';
import { AttachActionTile } from './AttachActionTile';

export interface AttachMenuSheetLabels {
    photo: string;
    camera: string;
    file: string;
}

export interface AttachMenuSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Accessible name of the sheet. Not drawn — the design has no title bar here. */
    title?: string;
    /**
     * The recent-photos strip above the actions (a `RecentPhotoStrip`). Left out on a shell that
     * cannot read the photo library — a browser, or an app built before it could — so an empty strip
     * is never drawn.
     */
    recent?: React.ReactNode;
    onPhoto: () => void;
    onCamera: () => void;
    /** Omit to hide the files entry. */
    onFile?: () => void;
    labels?: Partial<AttachMenuSheetLabels>;
}

const DEFAULT_LABELS: AttachMenuSheetLabels = { photo: 'Photos', camera: 'Camera', file: 'Files' };

/**
 * The chat attach menu (Figma `3749:28501`): an optional recent-photos strip over three entry points —
 * photos, camera, files. Photos, camera and files are fixed by the design, so they are named props
 * rather than a list the caller assembles; the glyphs and their colours come with them.
 *
 * Stateless: what each entry opens is the host's.
 */
export const AttachMenuSheet = ({
    open,
    onOpenChange,
    title = 'Attach',
    recent,
    onPhoto,
    onCamera,
    onFile,
    labels,
}: AttachMenuSheetProps) => {
    const text = { ...DEFAULT_LABELS, ...labels };
    return (
        // The upward shadow is the design's (Figma 3749:28501): on a white page the sheet has no other edge.
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={title}
            hideHeader
            className="rounded-t-[20px] shadow-[0_-2px_6px_rgba(0,0,0,0.12)]"
        >
            <div className="flex flex-col items-center gap-1 pb-8">
                {recent}
                <div
                    className={
                        recent ? 'flex w-full justify-center gap-6 pt-5' : 'flex w-full justify-center gap-6 pt-6'
                    }
                >
                    <AttachActionTile
                        icon={<IconGalleryWideSolid className="text-glyph-green" />}
                        label={text.photo}
                        onClick={onPhoto}
                    />
                    <AttachActionTile
                        icon={<IconCameraSolid className="text-glyph-indigo" />}
                        label={text.camera}
                        onClick={onCamera}
                    />
                    {onFile && (
                        <AttachActionTile
                            icon={<IconFileSolid className="text-glyph-cyan" />}
                            label={text.file}
                            onClick={onFile}
                        />
                    )}
                </div>
            </div>
        </BottomSheet>
    );
};
