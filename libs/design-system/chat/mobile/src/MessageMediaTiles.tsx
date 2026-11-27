import { useId, useState, type Ref } from 'react';

import { cn } from '@chatic/ui-kit';

import { IconAlert, IconImage, IconPlaySolid, IconSpinner } from '@chatic/design-system-assets/icons';

import { clampFileProgress } from './messageFile';
import { ProgressRing } from './ProgressRing';

export type MessageMediaTileState = 'ready' | 'sending' | 'failed' | 'broken';

export type MessageMediaKind = 'image' | 'video';

export interface MessageMediaTileItem {
    key: string;
    kind: MessageMediaKind;
    preview?: string;
    frameUrl?: string;
    state: MessageMediaTileState;
    progress?: number;
}

export interface MessageMediaTilesProps {
    items: readonly MessageMediaTileItem[];
    onOpen?: (index: number) => void;
    tileLabel?: (position: number, kind: MessageMediaKind) => string;
    sendingLabel?: string;
    onImageError?: (index: number) => void;
    className?: string;
    ref?: Ref<HTMLDivElement>;
}

export const MESSAGE_IMAGE_RENDER_MAX = 10;
export const MESSAGE_IMAGE_VISIBLE_MAX = 4;

const gridClass = (count: number) => {
    if (count === 1) return 'grid-cols-1';
    if (count === 3) return 'grid-cols-3';
    return 'grid-cols-2';
};

const defaultTileLabel = (position: number, kind: MessageMediaKind) =>
    `${kind === 'video' ? 'Video' : 'Photo'} ${position}`;

export const MessageMediaTiles = ({
    items,
    onOpen,
    tileLabel = defaultTileLabel,
    sendingLabel = 'Sending',
    onImageError,
    className,
    ref,
}: MessageMediaTilesProps) => {
    const progressIdBase = useId();
    const all = items.slice(0, MESSAGE_IMAGE_RENDER_MAX);
    if (all.length === 0) return null;
    const visible = all.slice(0, MESSAGE_IMAGE_VISIBLE_MAX);
    const hidden = all.length - visible.length;

    return (
        <div
            ref={ref}
            className={cn('grid w-[240px] gap-1 overflow-hidden rounded-[12px]', gridClass(visible.length), className)}
        >
            {visible.map((item, index) => {
                const more = hidden > 0 && index === visible.length - 1 ? hidden : 0;
                const ratio = item.state === 'sending' && more === 0 ? clampFileProgress(item.progress) : undefined;
                const progressId = ratio === undefined ? undefined : `${progressIdBase}-${index}`;
                const video = item.kind === 'video';
                const content = (
                    <>
                        {item.preview && item.state !== 'broken' ? (
                            <img
                                src={item.preview}
                                alt=""
                                className="size-full object-cover"
                                draggable={false}
                                onError={() => onImageError?.(index)}
                            />
                        ) : video && item.state !== 'broken' && item.frameUrl ? (
                            <VideoFrame key={item.frameUrl} url={item.frameUrl} />
                        ) : video && item.state !== 'broken' ? (
                            <span data-video-panel className="block size-full bg-media-tile" />
                        ) : item.state === 'ready' ? (
                            <span className="block size-full bg-muted" />
                        ) : (
                            <span className="flex size-full items-center justify-center bg-muted">
                                <IconImage className="size-6 text-description" />
                            </span>
                        )}
                        {video && item.state === 'ready' && more === 0 && (
                            <span
                                data-play-mark
                                className="absolute inset-0 flex items-center justify-center"
                                aria-hidden="true"
                            >
                                <span className="flex size-10 items-center justify-center rounded-full bg-black/40">
                                    <IconPlaySolid size={22} className="text-white" />
                                </span>
                            </span>
                        )}
                        {item.state === 'sending' && <SendingMark ratio={ratio} label={sendingLabel} id={progressId} />}
                        {item.state === 'failed' && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                                <IconAlert className="size-6 text-white" />
                            </span>
                        )}
                        {more > 0 && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[20px] font-semibold text-white">
                                +{more}
                            </span>
                        )}
                    </>
                );
                const tileClass = cn(
                    'relative aspect-square w-full overflow-hidden bg-muted',
                    visible.length === 1 && 'h-[240px]'
                );
                return onOpen ? (
                    <button
                        key={item.key}
                        type="button"
                        aria-label={tileLabel(index + 1, item.kind)}
                        aria-describedby={progressId}
                        onClick={() => onOpen(index)}
                        className={tileClass}
                    >
                        {content}
                    </button>
                ) : (
                    <span key={item.key} className={tileClass}>
                        {content}
                    </span>
                );
            })}
        </div>
    );
};

const SendingMark = ({ ratio, label, id }: { ratio: number | undefined; label: string; id?: string }) => (
    <span className="absolute inset-0 flex items-center justify-center bg-black/30">
        {ratio === undefined ? (
            <IconSpinner className="size-6 animate-spin text-white" />
        ) : (
            <span
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(ratio * 100)}
                className="relative flex size-11 items-center justify-center"
            >
                <ProgressRing ratio={ratio} size={40} trackClassName="stroke-white/30" fillClassName="stroke-white" />
                <span id={id} className="absolute text-[11px] font-semibold tabular-nums text-white">
                    {Math.round(ratio * 100)}%
                </span>
            </span>
        )}
    </span>
);

const VideoFrame = ({ url }: { url: string }) => {
    const [failed, setFailed] = useState(false);
    return (
        <span data-video-panel className="block size-full bg-media-tile">
            {!failed && (
                <video
                    data-video-frame
                    src={`${url}#t=0.5`}
                    muted
                    playsInline
                    preload="metadata"
                    disablePictureInPicture
                    tabIndex={-1}
                    aria-hidden="true"
                    className="pointer-events-none size-full object-cover"
                    onError={() => setFailed(true)}
                />
            )}
        </span>
    );
};
