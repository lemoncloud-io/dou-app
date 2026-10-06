import { useState, type Ref } from 'react';

import { cn } from '@chatic/lib/utils';

import { IconAlert, IconImage, IconPlaySolid, IconSpinner } from '../../resources/icons';

/**
 * - `ready` — drawn from `preview`. A `ready` tile with no `preview` yet is one the host is still
 *   resolving (reading it from a local cache, say), drawn as an empty tile rather than as a missing
 *   image.
 * - `sending` / `failed` — a message still on its way, drawn from its local preview.
 * - `broken` — the server reports the upload unusable (missing, not the sender's, never finished).
 *   Drawn as a placeholder rather than dropped, so the count still matches what was sent.
 */
export type MessageMediaTileState = 'ready' | 'sending' | 'failed' | 'broken';

/** What a tile stands for. A video is drawn from its poster and is never played in the feed. */
export type MessageMediaKind = 'image' | 'video';

export interface MessageMediaTileItem {
    key: string;
    kind: MessageMediaKind;
    /**
     * What the tile draws: an image's thumbnail (or the original, when the server made none), a
     * video's poster frame. A video may have none at all — one picked in a browser travels without a
     * poster, and a shell video's poster arrives only once it has been prepared.
     */
    preview?: string;
    /**
     * A video with no `preview` that may draw its own first frame from this address: a muted `<video>`
     * that loads only its metadata and the frame half a second in, and never plays. The host sets it
     * only for a tile on screen, and only where it cannot make the frame into an image itself — the
     * element has no other cache than the browser's, and asks the server for every tile it is in.
     * Ignored while `preview` is set.
     */
    frameUrl?: string;
    state: MessageMediaTileState;
}

export interface MessageMediaTilesProps {
    items: readonly MessageMediaTileItem[];
    /** Fired with the tapped item's index. Omit to draw the tiles inert. */
    onOpen?: (index: number) => void;
    /** Accessible name for a tile; receives the 1-based position and what the tile stands for. */
    tileLabel?: (position: number, kind: MessageMediaKind) => string;
    /**
     * Fired with the index of a preview that failed to load. Signed addresses expire, so the host can
     * fetch fresh ones; the tile itself only reports it.
     */
    onImageError?: (index: number) => void;
    className?: string;
    /** The grid's own element — for a host that needs to know when the tiles are on screen. */
    ref?: Ref<HTMLDivElement>;
}

/** A message never draws more than the server attaches to one. */
export const MESSAGE_IMAGE_RENDER_MAX = 10;
/**
 * Past this many, the last visible tile carries a "+n" for the rest. Exported so a host that resolves
 * addresses itself can skip the previews no tile draws.
 */
export const MESSAGE_IMAGE_VISIBLE_MAX = 4;

const gridClass = (count: number) => {
    if (count === 1) return 'grid-cols-1';
    if (count === 3) return 'grid-cols-3';
    return 'grid-cols-2';
};

const defaultTileLabel = (position: number, kind: MessageMediaKind) =>
    `${kind === 'video' ? 'Video' : 'Photo'} ${position}`;

/**
 * The photos and videos of one chat message, as fixed-size tiles in the order they were sent: one
 * square, two or three in a row, four or more as a 2×2 whose last tile says how many more there are.
 *
 * Fixed size because the message carries no dimensions for its media — the server leaves them out of
 * what it embeds and expects the app to draw a fixed tile — so there is nothing to reserve an aspect
 * ratio from before the preview arrives.
 *
 * A video tile is a still: its poster when it has one, a grey panel when it has none, and a play
 * mark in the middle so it never reads as a photo. A `<video>` element appears only when the host
 * hands a tile a `frameUrl` — one per tile would have every video in a scrolled-past conversation start
 * fetching, so the host does that for tiles on screen alone, and only where it has no image of the
 * frame to give. Even then it never plays: the viewer a tap opens is where a video plays. The play mark
 * gives way to whatever else claims the centre — the sending spinner, the failed mark, the "+n" count —
 * and a broken video is the same placeholder as a broken photo: it cannot be played, so a play mark on
 * it would promise what the tap cannot keep.
 */
export const MessageMediaTiles = ({
    items,
    onOpen,
    tileLabel = defaultTileLabel,
    onImageError,
    className,
    ref,
}: MessageMediaTilesProps) => {
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
                            // No poster yet (or none coming): the panel says "video" on its own, and is dark
                            // enough for the white marks drawn over it.
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
                        {item.state === 'sending' && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <IconSpinner className="size-6 animate-spin text-white" />
                            </span>
                        )}
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

/**
 * A video's first frame drawn by the browser itself, on the grey panel it replaces. The `#t=0.5`
 * fragment is what makes an element that never plays draw a picture at all — without it the engines
 * measured showed their default grey — and half a second in passes the black a recording often opens
 * on. A load that fails leaves the panel: an expired address is the viewer's to refresh when tapped.
 */
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
