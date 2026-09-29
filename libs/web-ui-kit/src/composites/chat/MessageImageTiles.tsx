import { cn } from '@chatic/lib/utils';

import { IconAlert, IconImage, IconSpinner } from '../../resources/icons';

/**
 * - `ready` — drawn from `src`.
 * - `sending` / `failed` — a message still on its way, drawn from its local preview.
 * - `broken` — the server reports the upload unusable (missing, not the sender's, never finished).
 *   Drawn as a placeholder rather than dropped, so the count still matches what was sent.
 */
export type MessageImageTileState = 'ready' | 'sending' | 'failed' | 'broken';

export interface MessageImageTileItem {
    key: string;
    src?: string;
    state: MessageImageTileState;
}

export interface MessageImageTilesProps {
    items: MessageImageTileItem[];
    /** Fired with the tapped item's index. Omit to draw the tiles inert. */
    onOpen?: (index: number) => void;
    /** Accessible name for a tile; receives the 1-based position. */
    tileLabel?: (position: number) => string;
    /**
     * Fired with the index of an image that failed to load. Signed addresses expire, so the host can
     * fetch fresh ones; the tile itself only reports it.
     */
    onImageError?: (index: number) => void;
    className?: string;
}

/** A message never draws more than the server attaches to one. */
export const MESSAGE_IMAGE_RENDER_MAX = 10;
/** Past this many, the last visible tile carries a "+n" for the rest. */
const VISIBLE_MAX = 4;

const gridClass = (count: number) => {
    if (count === 1) return 'grid-cols-1';
    if (count === 3) return 'grid-cols-3';
    return 'grid-cols-2';
};

/**
 * The images of one chat message, as fixed-size tiles: one square, two or three in a row, four or
 * more as a 2×2 whose last tile says how many more there are.
 *
 * Fixed size because the message carries no dimensions for its images — the server leaves them out
 * of what it embeds and expects the app to draw a fixed tile — so there is nothing to reserve an
 * aspect ratio from before the image arrives.
 */
export const MessageImageTiles = ({
    items,
    onOpen,
    tileLabel = position => `Photo ${position}`,
    onImageError,
    className,
}: MessageImageTilesProps) => {
    const all = items.slice(0, MESSAGE_IMAGE_RENDER_MAX);
    if (all.length === 0) return null;
    const visible = all.slice(0, VISIBLE_MAX);
    const hidden = all.length - visible.length;

    return (
        <div
            className={cn('grid w-[240px] gap-1 overflow-hidden rounded-[12px]', gridClass(visible.length), className)}
        >
            {visible.map((item, index) => {
                const more = hidden > 0 && index === visible.length - 1 ? hidden : 0;
                const content = (
                    <>
                        {item.src && item.state !== 'broken' ? (
                            <img
                                src={item.src}
                                alt=""
                                className="size-full object-cover"
                                draggable={false}
                                onError={() => onImageError?.(index)}
                            />
                        ) : (
                            <span className="flex size-full items-center justify-center bg-muted">
                                <IconImage className="size-6 text-description" />
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
                        aria-label={tileLabel(index + 1)}
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
