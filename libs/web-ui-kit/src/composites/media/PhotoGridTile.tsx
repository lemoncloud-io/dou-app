import { cn } from '@chatic/ui-kit';

import { PreviewImage } from './PreviewImage';
import type { PhotoItemKind } from './types';
import { VideoMark } from './VideoMark';

export interface PhotoGridTileProps {
    src: string;
    kind?: PhotoItemKind;
    durationMs?: number;
    order?: number;
    onToggle: () => void;
    label: string;
    disabled?: boolean;
    className?: string;
}

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
            <PreviewImage src={src} />
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
