import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import {
    IconAlert,
    IconCheck,
    IconDownload,
    IconFileDoc,
    IconFileGeneric,
    IconFileHangul,
    IconFilePdf,
    IconFileSheet,
    IconFileSlides,
    IconFileText,
    IconSpinner,
    type FileKindIconProps,
} from '@chatic/design-system-assets/icons';
import { clampFileProgress, formatFileSize, messageFileKind, splitFileName, type MessageFileKind } from './messageFile';
import { ProgressRing } from './ProgressRing';

export type MessageFileCardState = 'ready' | 'sending' | 'failed' | 'broken';

export type MessageFileDownloadState = 'idle' | 'downloading' | 'done';

export interface MessageFileCardLabels {
    untitled: string;
    download: string;
    cancel: string;
    open: string;
    broken: string;
    sending: string;
    failed: string;
}

export interface MessageFileCardProps {
    name?: string;
    size?: number;
    state?: MessageFileCardState;
    download?: MessageFileDownloadState;
    progress?: number;
    onPress?: () => void;
    onDownload?: () => void;
    onCancel?: () => void;
    onOpen?: () => void;
    labels?: Partial<MessageFileCardLabels>;
    className?: string;
}

const DEFAULT_LABELS: MessageFileCardLabels = {
    untitled: 'File',
    download: 'Download',
    cancel: 'Cancel download',
    open: 'Open',
    broken: "Can't open",
    sending: 'Sending',
    failed: "Couldn't send",
};

const KIND_GLYPH: Readonly<Record<MessageFileKind, { Icon: React.ComponentType<FileKindIconProps>; tint: string }>> = {
    pdf: { Icon: IconFilePdf, tint: 'text-destructive' },
    doc: { Icon: IconFileDoc, tint: 'text-point-blue' },
    sheet: { Icon: IconFileSheet, tint: 'text-glyph-green' },
    slides: { Icon: IconFileSlides, tint: 'text-glyph-indigo' },
    hangul: { Icon: IconFileHangul, tint: 'text-glyph-cyan' },
    text: { Icon: IconFileText, tint: 'text-description' },
    file: { Icon: IconFileGeneric, tint: 'text-description' },
};

export const MessageFileCard = ({
    name,
    size,
    state = 'ready',
    download = 'idle',
    progress,
    onPress,
    onDownload,
    onCancel,
    onOpen,
    labels,
    className,
}: MessageFileCardProps) => {
    const text = { ...DEFAULT_LABELS, ...labels };
    const nameId = React.useId();
    const shown = name?.trim() ? name : text.untitled;
    const { base, extension } = splitFileName(shown);
    const { Icon, tint } = KIND_GLYPH[messageFileKind(name)];
    const broken = state === 'broken';
    const ready = state === 'ready';

    const ratio = clampFileProgress(progress);
    const sentBytes = state === 'sending' && ratio !== undefined && size !== undefined ? ratio * size : undefined;
    const sub = broken
        ? text.broken
        : sentBytes !== undefined
          ? `${formatFileSize(sentBytes)} / ${formatFileSize(size)}`
          : formatFileSize(size);

    const body = (
        <>
            <Icon size={36} className={cn('shrink-0', tint)} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span id={nameId} className="sr-only">
                    {shown}
                </span>
                <span
                    aria-hidden="true"
                    className="flex min-w-0 items-end text-[14px] font-semibold leading-[1.35] tracking-[-0.28px] text-foreground"
                >
                    <span className="line-clamp-2 min-w-0 break-all">{base}</span>
                    {extension && <span className="shrink-0">{extension}</span>}
                </span>
                {sub && (
                    <span className="text-[12px] leading-[1.4] tracking-[-0.12px] text-description tabular-nums">
                        {sub}
                    </span>
                )}
            </span>
        </>
    );

    const trailing = (() => {
        if (state === 'sending') {
            return ratio === undefined ? (
                <span role="status" aria-label={text.sending} className="flex size-11 items-center justify-center">
                    <IconSpinner className="size-5 animate-spin text-description" />
                </span>
            ) : (
                <span
                    role="progressbar"
                    aria-label={text.sending}
                    aria-describedby={nameId}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(ratio * 100)}
                    className="flex size-11 items-center justify-center"
                >
                    <ProgressRing ratio={ratio} size={24} />
                </span>
            );
        }
        if (state === 'failed') {
            return (
                <span role="img" aria-label={text.failed} className="flex size-11 items-center justify-center">
                    <IconAlert className="size-5 text-destructive" />
                </span>
            );
        }
        if (!ready) return null;

        const button =
            download === 'downloading'
                ? {
                      label: text.cancel,
                      onClick: onCancel,
                      glyph:
                          ratio === undefined ? (
                              <IconSpinner className="size-5 animate-spin text-foreground" />
                          ) : (
                              <ProgressRing ratio={ratio} stop />
                          ),
                  }
                : download === 'done'
                  ? {
                        label: text.open,
                        onClick: onOpen,
                        glyph: <IconCheck className="size-[18px] text-foreground" strokeWidth={2.5} />,
                    }
                  : {
                        label: text.download,
                        onClick: onDownload,
                        glyph: <IconDownload className="size-[18px] text-foreground" />,
                    };
        return (
            <button
                type="button"
                aria-label={button.label}
                aria-describedby={nameId}
                data-download={download}
                onClick={button.onClick}
                className="flex size-11 shrink-0 items-center justify-center transition-opacity active:opacity-70"
            >
                <span className="flex size-8 items-center justify-center rounded-full bg-control-surface">
                    {button.glyph}
                </span>
            </button>
        );
    })();

    const bodyClass = cn(
        'flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-2.5 text-left',
        trailing ? 'pr-1' : 'pr-2.5'
    );

    return (
        <div
            className={cn(
                'flex w-[240px] max-w-full items-center overflow-hidden rounded-[14px] border border-border bg-card',
                broken && 'opacity-50',
                className
            )}
        >
            {onPress && !broken ? (
                <button type="button" onClick={onPress} className={bodyClass}>
                    {body}
                </button>
            ) : (
                <span className={bodyClass}>{body}</span>
            )}
            {trailing && <span className="flex shrink-0 items-center pr-1">{trailing}</span>}
        </div>
    );
};
