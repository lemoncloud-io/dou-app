import * as React from 'react';

import { cn } from '@chatic/ui-kit';

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

export interface PickedFileItem {
    id: string;
    name: string;
    size?: number;
}

export interface PickedFileStripProps {
    files: PickedFileItem[];
    onRemove: (id: string) => void;
    removeLabel?: (name: string, position: number) => string;
    label?: string;
    className?: string;
}

const KIND_GLYPH: Readonly<Record<MessageFileKind, { Icon: React.ComponentType<FileKindIconProps>; tint: string }>> = {
    pdf: { Icon: IconFilePdf, tint: 'text-destructive' },
    doc: { Icon: IconFileDoc, tint: 'text-point-blue' },
    sheet: { Icon: IconFileSheet, tint: 'text-glyph-green' },
    slides: { Icon: IconFileSlides, tint: 'text-glyph-indigo' },
    hangul: { Icon: IconFileHangul, tint: 'text-glyph-cyan' },
    text: { Icon: IconFileText, tint: 'text-description' },
    file: { Icon: IconFileGeneric, tint: 'text-description' },
};

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
