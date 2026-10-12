import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import {
    IconClose,
    IconFileDoc,
    IconFileGeneric,
    IconFileHangul,
    IconFilePdf,
    IconFileSheet,
    IconFileSlides,
    IconFileText,
    type FileKindIconProps,
} from '../../resources/icons';
import { formatFileSize, messageFileKind, splitFileName, type MessageFileKind } from './messageFile';

/** One file waiting above the composer. */
export interface PickedFileItem {
    /** The host's key for the item — what `onRemove` hands back. */
    id: string;
    /** The file's name, extension included. */
    name: string;
    /** In bytes. Left out of the chip when missing. */
    size?: number;
}

export interface PickedFileStripProps {
    /** The waiting files, in pick order. Empty draws nothing. */
    files: PickedFileItem[];
    onRemove: (id: string) => void;
    /** Accessible name of a chip's remove button; receives the file's name and its 1-based position. */
    removeLabel?: (name: string, position: number) => string;
    /** Names the row, which then reads as a group — nothing around a composer says what it is. */
    label?: string;
    /** On the row's surface. Space the host wants between the row and its field goes here, as a margin. */
    className?: string;
}

// The same glyph and tint per kind as the document card in the feed, so a file reads the same before it
// is sent as after. A photo or a video picked from the files picker is a plain file here: the row has
// no bytes to draw a thumbnail from — the app keeps them until the send, and a page file's would be a
// whole photo decoded for a 48 px tile — and a chip only has to say which file it is.
const KIND_GLYPH: Readonly<Record<MessageFileKind, { Icon: React.ComponentType<FileKindIconProps>; tint: string }>> = {
    pdf: { Icon: IconFilePdf, tint: 'text-destructive' },
    doc: { Icon: IconFileDoc, tint: 'text-point-blue' },
    sheet: { Icon: IconFileSheet, tint: 'text-glyph-green' },
    slides: { Icon: IconFileSlides, tint: 'text-glyph-indigo' },
    hangul: { Icon: IconFileHangul, tint: 'text-glyph-cyan' },
    text: { Icon: IconFileText, tint: 'text-description' },
    file: { Icon: IconFileGeneric, tint: 'text-description' },
};

/**
 * Files picked to go with the next message, as a row of compact chips above a chat composer's field:
 * the kind's glyph, the name, the size and a remove button. It is `SelectedPhotoStrip`'s counterpart
 * for documents, on the same soft surface, and it scrolls sideways once the chips outgrow the composer.
 *
 * A long name is cut at the end of its body and the extension stays whole after it: two waiting files
 * that differ only in what they are — `report.pdf` and `report.hwp` — must not both read "report…".
 *
 * Stateless and with no motion of its own: the host decides what waits, and nothing is drawn while
 * nothing does.
 */
export const PickedFileStrip = ({
    files,
    onRemove,
    removeLabel = name => `Remove ${name}`,
    label,
    className,
}: PickedFileStripProps) => {
    if (files.length === 0) return null;
    return (
        <div
            role={label ? 'group' : undefined}
            aria-label={label}
            data-picked-files=""
            // The field's own glass, as the photo row above a composer has: the list scrolls on behind it.
            className={cn(
                'w-fit max-w-full rounded-2xl bg-white/80 p-1.5 backdrop-blur-[4px] dark:bg-black/80',
                className
            )}
        >
            <ul className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                {files.map((file, index) => {
                    const { base, extension } = splitFileName(file.name);
                    const { Icon, tint } = KIND_GLYPH[messageFileKind(file.name)];
                    const size = formatFileSize(file.size);
                    return (
                        <li
                            key={file.id}
                            data-picked-file=""
                            className="flex h-12 w-[184px] shrink-0 items-center gap-2 rounded-xl border border-border bg-card pl-2"
                        >
                            <Icon size={28} className={cn('shrink-0', tint)} />
                            <span className="flex min-w-0 flex-1 flex-col">
                                {/* One string for assistive tech; the drawn name is two spans. */}
                                <span className="sr-only">{file.name}</span>
                                <span
                                    aria-hidden="true"
                                    className="flex min-w-0 text-[13px] font-semibold leading-[1.35] tracking-[-0.26px] text-foreground"
                                >
                                    <span className="min-w-0 truncate">{base}</span>
                                    {extension && <span className="shrink-0">{extension}</span>}
                                </span>
                                {size && (
                                    <span className="text-[11px] leading-[1.4] text-description tabular-nums">
                                        {size}
                                    </span>
                                )}
                            </span>
                            <button
                                type="button"
                                aria-label={removeLabel(file.name, index + 1)}
                                onClick={() => onRemove(file.id)}
                                // A 36px target around a small mark: the chip's height is all the room it has.
                                className="flex size-9 shrink-0 items-center justify-center"
                            >
                                <span className="flex items-center rounded-full bg-tile-ring/[0.76] p-[3px]">
                                    <IconClose className="size-3 text-foreground" />
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};
