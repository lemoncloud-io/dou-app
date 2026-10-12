import * as React from 'react';

import { cn } from '@chatic/lib/utils';

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
} from '../../resources/icons';
import { clampFileProgress, formatFileSize, messageFileKind, splitFileName, type MessageFileKind } from './messageFile';
import { ProgressRing } from './ProgressRing';

/**
 * Where the file itself stands — the same four states a media tile has.
 *
 * - `ready` — sent and stored; the card can be opened and downloaded.
 * - `sending` / `failed` — a message still on its way, drawn from the name and size picked locally.
 *   Nothing is downloadable yet, so there is no download button.
 * - `broken` — the server reports the upload unusable. Kept as a dimmed card that says it cannot be
 *   opened, rather than dropped, so what was sent still shows.
 */
export type MessageFileCardState = 'ready' | 'sending' | 'failed' | 'broken';

/**
 * The download button of a `ready` card.
 *
 * - `idle` — not downloaded this session; pressing it starts the download.
 * - `downloading` — a ring filling with `progress`, or a spinner while that is unknown. Pressing it
 *   again cancels.
 * - `done` — downloaded; pressing it opens the downloaded file.
 * - `unavailable` — this shell cannot save a file (an app built before it could). No button, a notice
 *   in its place: a button that can only fail is worse than saying why there is none.
 */
export type MessageFileDownloadState = 'idle' | 'downloading' | 'done' | 'unavailable';

export interface MessageFileCardLabels {
    /** The name drawn for an upload that carries none — older uploads did not. */
    untitled: string;
    download: string;
    cancel: string;
    open: string;
    /** The notice drawn instead of the button while `download` is `unavailable`. */
    unavailable: string;
    /** The line a `broken` card shows in place of its size. */
    broken: string;
    /** Accessible names of the sending spinner or ring, and of the failed mark. */
    sending: string;
    failed: string;
}

export interface MessageFileCardProps {
    /** The file's name, extension included. Omitted for an old upload that has none. */
    name?: string;
    /** In bytes. Left out of the card when missing. */
    size?: number;
    state?: MessageFileCardState;
    /** The download button's state; only a `ready` card has one. */
    download?: MessageFileDownloadState;
    /**
     * 0..1 — of the download while `downloading`, of the upload while `sending`. Omit when it is not
     * known, and a spinner turns instead.
     */
    progress?: number;
    /**
     * Tap on the card's body. What it does is the host's — a preview where the shell has one, the
     * same download as the button where it does not. Omit to draw the body inert.
     */
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
    unavailable: 'Update the app to download',
    broken: "Can't open",
    sending: 'Sending',
    failed: "Couldn't send",
};

// The glyph and its tint for each kind. The tint follows the colour each family's own programs
// have taught people to look for (red PDF, blue word processor, green spreadsheet); the tag drawn on
// the glyph carries the same news for anyone the colour does not reach.
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
 * A document in a chat message (pdf, word processor, spreadsheet, slides, Hangul, plain text): the
 * kind's glyph, the name, the size, and a download button at the right edge.
 *
 * The button is always in sight rather than behind a menu — a document is something people come to a
 * chat to take away, so downloading it is one press from the feed. Its hit area is 44px square, the
 * smallest a thumb reliably lands on, though the circle drawn inside it is smaller. The card's body is
 * a separate target, and what it does is the host's (`onPress`).
 *
 * The name wraps to two lines and is cut short in the middle, never at the end: the body is clamped,
 * the extension sits after it untouched. Two files that differ only in what they are — `report.pdf`
 * and `report.hwp` — must not both read "report…".
 *
 * Stateless: the host owns the download, its progress and what "done" means (a session-long record of
 * which uploads have been saved, say). The card draws the state it is handed.
 */
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
    // While it goes up, how much of it has: the ring alone says little about a 300MB video's minutes.
    const sentBytes = state === 'sending' && ratio !== undefined && size !== undefined ? ratio * size : undefined;
    const sub = broken
        ? text.broken
        : sentBytes !== undefined
          ? `${formatFileSize(sentBytes)} / ${formatFileSize(size)}`
          : formatFileSize(size);
    const notice = ready && download === 'unavailable' ? text.unavailable : undefined;

    const body = (
        <>
            <Icon size={36} className={cn('shrink-0', tint)} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                {/* The name as one string for assistive tech — the drawn one is two spans, which a screen
                    reader would otherwise read as "report", pause, "dot pdf". */}
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
                {notice && (
                    <span className="text-[12px] leading-[1.4] tracking-[-0.12px] text-description">{notice}</span>
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
        if (!ready || download === 'unavailable') return null;

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
                // Names which file, so a list of cards is not a list of identical "Download" buttons.
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
