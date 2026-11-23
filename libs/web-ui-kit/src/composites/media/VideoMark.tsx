import { cn } from '@chatic/ui-kit';

import { IconPlaySolid } from '../../resources/icons';

export const formatVideoDuration = (durationMs: number): string => {
    const total = Number.isFinite(durationMs) && durationMs > 0 ? Math.floor(durationMs / 1000) : 0;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, '0');
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
};

export interface VideoMarkProps {
    durationMs?: number;
    className?: string;
}

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
