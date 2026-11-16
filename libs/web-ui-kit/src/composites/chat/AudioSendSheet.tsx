import { cn } from '@chatic/ui-kit';

import { IconAudioWave, IconClose } from '../../resources/icons';
import { BottomSheet } from '../overlay/BottomSheet';
import { splitFileName } from './messageFile';

export interface AudioSendSheetItem {
    /** Stable identity, handed back to `onRemove`. */
    key: string;
    /** The file's name, extension included. */
    name: string;
    /** The line under the name, formatted by the host — `35:47 · 17.0MB`. */
    meta?: string;
}

export interface AudioSendSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The files about to go, in the order they will be sent. */
    items: AudioSendSheetItem[];
    /** The × on a row. Closing the sheet when the last row goes is the host's decision. */
    onRemove: (key: string) => void;
    onCancel: () => void;
    onSend: () => void;
    /** The sheet's title, drawn and used as its accessible name (Figma 6072:22942). */
    title?: string;
    /** The primary button's text — the host counts, e.g. `Send 2`. */
    sendLabel?: string;
    cancelLabel?: string;
    /** The × button's accessible name for one row, so a list of rows is not a list of identical "Remove"s. */
    removeLabel?: (name: string) => string;
    className?: string;
}

/** One file to send (Figma "파일 행", 6072:22944): an ink tile with a waveform, the name and meta, a ×. */
const AudioSendRow = ({
    item,
    onRemove,
    removeLabel,
}: {
    item: AudioSendSheetItem;
    onRemove: (key: string) => void;
    removeLabel: (name: string) => string;
}) => {
    const { base, extension } = splitFileName(item.name);
    return (
        <li className="flex items-center gap-3 py-2.5">
            <span
                aria-hidden="true"
                className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-brand-ink text-bubble-mine-foreground"
            >
                <IconAudioWave size={20} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="sr-only">{item.name}</span>
                {/* Cut in the middle so the extension stays in sight, as every file name in this kit is. */}
                <span
                    aria-hidden="true"
                    className="flex min-w-0 text-[15px] font-semibold leading-[normal] text-foreground"
                >
                    <span className="min-w-0 truncate">{base}</span>
                    {extension && <span className="shrink-0">{extension}</span>}
                </span>
                {item.meta && (
                    <span className="truncate text-[13px] leading-[normal] text-description tabular-nums">
                        {item.meta}
                    </span>
                )}
            </span>
            {/* A 24px disc drawn inside a 44px target, pulled back so the disc keeps the row's edge. */}
            <button
                type="button"
                onClick={() => onRemove(item.key)}
                aria-label={removeLabel(item.name)}
                className="-mr-2.5 flex size-11 shrink-0 items-center justify-center transition-opacity active:opacity-70"
            >
                <span className="flex size-6 items-center justify-center rounded-full bg-action-soft">
                    <IconClose className="size-3 text-description" strokeWidth={2.5} />
                </span>
            </button>
        </li>
    );
};

/**
 * The confirmation before audio files are sent (Figma "음성 파일 · 전송 확인 시트", 6072:22979; in
 * place on screen 6044:20710): a titled sheet listing each file with its length and size, a × to
 * drop one, and Cancel / Send.
 *
 * Audio is asked about where a photo is not because a recording is long and large — a 70MB file
 * picked by mistake is minutes of upload — and the list is the last chance to see that before it
 * starts.
 *
 * Stateless: the list, what the counts read and what happens when it empties are the host's.
 */
export const AudioSendSheet = ({
    open,
    onOpenChange,
    items,
    onRemove,
    onCancel,
    onSend,
    title = 'Send audio files',
    sendLabel = 'Send',
    cancelLabel = 'Cancel',
    removeLabel = name => `Remove ${name}`,
    className,
}: AudioSendSheetProps) => (
    <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        hideHeader
        showHandle
        className={cn('rounded-t-[20px] shadow-[0_-2px_6px_rgba(0,0,0,0.12)]', className)}
        footer={
            // The sheet already pads for the home indicator; this is only the gap the design keeps above it.
            <div className="flex gap-2 px-4 pb-4 pt-5">
                <button
                    type="button"
                    onClick={onCancel}
                    className="h-[50px] min-w-0 flex-1 truncate rounded-[12px] border border-input-border bg-surface px-3 text-[15px] font-semibold text-foreground transition-opacity active:opacity-70"
                >
                    {cancelLabel}
                </button>
                <button
                    type="button"
                    onClick={onSend}
                    disabled={items.length === 0}
                    className="h-[50px] min-w-0 flex-1 truncate rounded-[12px] bg-brand-ink px-3 text-[15px] font-semibold text-bubble-mine-foreground transition-opacity active:opacity-70 disabled:bg-control-idle disabled:text-placeholder"
                >
                    {sendLabel}
                </button>
            </div>
        }
    >
        <div className="px-4 pt-8">
            {/* The sheet's accessible name is the hidden header title; this copy is for the eye. */}
            <p aria-hidden className="truncate pb-4 text-[17px] font-semibold leading-[normal] text-foreground">
                {title}
            </p>
            <ul className="flex flex-col gap-1">
                {items.map(item => (
                    <AudioSendRow key={item.key} item={item} onRemove={onRemove} removeLabel={removeLabel} />
                ))}
            </ul>
        </div>
    </BottomSheet>
);
