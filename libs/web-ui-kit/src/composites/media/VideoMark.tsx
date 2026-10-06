import { cn } from '@chatic/lib/utils';

import { IconPlaySolid } from '../../resources/icons';

/**
 * A video's length as a picker shows it: `m:ss`, and `h:mm:ss` from an hour. Rounded down, so a clip
 * of 59.9 seconds reads `0:59` rather than a minute it does not last. Negative or non-finite input is
 * `0:00`.
 */
export const formatVideoDuration = (durationMs: number): string => {
    const total = Number.isFinite(durationMs) && durationMs > 0 ? Math.floor(durationMs / 1000) : 0;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, '0');
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
};

export interface VideoMarkProps {
    /** Omitted: the play mark alone, for a video whose length the library did not report. */
    durationMs?: number;
    className?: string;
}

/**
 * The corner mark that tells a video's poster apart from a photo in the picker: a play triangle and the
 * length. Decorative — the tile's own label says what it is — and it never takes a tap, which belongs
 * to the tile under it.
 */
export const VideoMark = ({ durationMs, className }: VideoMarkProps) => (
    <span
        aria-hidden
        data-video-mark
        className={cn(
            'pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded-full bg-black/50 py-0.5 pl-1 pr-1.5 text-[11px] font-semibold leading-[14px] text-white',
            className
        )}
    >
        <IconPlaySolid size={12} className="text-white" />
        {durationMs !== undefined && <span>{formatVideoDuration(durationMs)}</span>}
    </span>
);
