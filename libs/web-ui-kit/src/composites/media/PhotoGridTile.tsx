import { cn } from '@chatic/lib/utils';

import type { PhotoItemKind } from './types';
import { VideoMark } from './VideoMark';

export interface PhotoGridTileProps {
    src: string;
    /** A video draws its poster with a play mark and its length. Default `image`. */
    kind?: PhotoItemKind;
    durationMs?: number;
    /** 1-based pick order when picked; absent when not. */
    order?: number;
    onToggle: () => void;
    /** Accessible name. Host supplies a localized string. */
    label: string;
    /** Blocks picking more — the host passes it once the cap is reached, for unpicked tiles only. */
    disabled?: boolean;
    className?: string;
}

/**
 * One square in the photo grid (Figma `3766:30801` / `3767:30959`). Unpicked: an empty ring in the
 * top-right corner. Picked: the photo dims and the ring becomes a lime badge carrying the pick order,
 * so the order the message will send in is visible while choosing it. A video is its poster frame with
 * a play mark and its length in the bottom-left corner, clear of the ring.
 */
export const PhotoGridTile = ({
    src,
    kind = 'image',
    durationMs,
    order,
    onToggle,
    label,
    disabled = false,
    className,
}: PhotoGridTileProps) => {
    const picked = order !== undefined;
    return (
        <button
            type="button"
            aria-label={label}
            aria-pressed={picked}
            onClick={onToggle}
            disabled={disabled && !picked}
            className={cn(
                'relative aspect-square w-full overflow-hidden bg-muted disabled:cursor-not-allowed',
                className
            )}
        >
            <img src={src} alt="" className="size-full object-cover" draggable={false} />
            {kind === 'video' && <VideoMark durationMs={durationMs} />}
            {picked && <span aria-hidden className="absolute inset-0 bg-black/[0.52]" />}
            <span
                aria-hidden
                className={cn(
                    'absolute right-3 top-3 flex size-6 items-center justify-center rounded-full border backdrop-blur-[1px]',
                    picked ? 'border-primary bg-primary' : 'border-placeholder bg-white/[0.32]'
                )}
            >
                {picked && (
                    <span className="w-[18px] text-center text-[13px] font-semibold leading-[15px] tracking-[-0.455px] text-black">
                        {order}
                    </span>
                )}
            </span>
        </button>
    );
};
