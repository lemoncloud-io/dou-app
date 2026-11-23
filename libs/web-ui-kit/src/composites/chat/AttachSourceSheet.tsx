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
    title?: string;
    onAlbum: () => void;
    onFiles: () => void;
    labels?: Partial<AttachSourceSheetLabels>;
    notice?: React.ReactNode;
}

const DEFAULT_LABELS: AttachSourceSheetLabels = { album: 'From album', files: 'From files' };

interface SourceRowProps {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
}

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
