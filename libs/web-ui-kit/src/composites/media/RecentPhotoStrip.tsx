import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { SLIDE_TIMING, useSlidePresence } from '../overlay/slidePresence';
import { PreviewImage } from './PreviewImage';
import type { PhotoItem } from './types';
import { VideoMark } from './VideoMark';

export interface RecentPhotoStripProps {
    title: string;
    seeAllLabel: string;
    onSeeAll: () => void;
    photos: PhotoItem[];
    loading?: boolean;
    placeholderCount?: number;
    onSelect?: (id: string) => void;
    onToggle?: (id: string) => void;
    picked?: string[];
    max?: number;
    photoLabel?: (position: number) => string;
    videoLabel?: (position: number) => string;
    className?: string;
}

const NONE: string[] = [];

interface View {
    photos: PhotoItem[];
    skeletons: number;
}

export const RecentPhotoStrip = ({
    title,
    seeAllLabel,
    onSeeAll,
    photos,
    loading = false,
    placeholderCount = 6,
    onSelect,
    onToggle,
    picked = NONE,
    max = Number.POSITIVE_INFINITY,
    photoLabel = position => `Recent photo ${position}`,
    videoLabel = photoLabel,
    className,
}: RecentPhotoStripProps) => {
    const skeletons = loading ? Math.max(0, placeholderCount - photos.length) : 0;
    const present = photos.length > 0 || skeletons > 0;

    const [last, setLast] = React.useState<View>({ photos, skeletons });
    if (present && (last.photos !== photos || last.skeletons !== skeletons)) setLast({ photos, skeletons });
    const view: View = present ? { photos, skeletons } : last;

    const [natural, setNatural] = React.useState<number | null>(null);
    const measure = React.useCallback((node: HTMLDivElement | null) => {
        if (!node) return undefined;
        const read = () => setNatural(node.offsetHeight);
        read();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(read);
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    const { mounted, shown, instant, ref, onTransitionEnd } = useSlidePresence<HTMLDivElement>(present, {
        property: 'height',
    });

    if (!mounted) return null;
    const pickable = onToggle !== undefined;
    const full = picked.length >= max;
    const waiting = view.photos.length === 0;
    return (
        <div
            ref={ref}
            data-recent-strip=""
            data-shown={shown}
            inert={!present}
            aria-hidden={!present || undefined}
            onTransitionEnd={onTransitionEnd}
            style={{ height: shown ? (natural ?? undefined) : 0 }}
            className={cn(
                'w-full shrink-0 overflow-hidden',
                instant ? 'transition-none' : cn('transition-[height]', SLIDE_TIMING)
            )}
        >
            <div
                ref={measure}
                className={cn(
                    'flow-root',
                    instant ? 'transition-none' : cn('transition-[transform,opacity]', SLIDE_TIMING),
                    shown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
                )}
            >
                <div
                    aria-busy={view.skeletons > 0 || undefined}
                    className={cn('flex w-full flex-col gap-1', className)}
                >
                    <div className="flex items-center gap-3 px-4 py-3.5 text-[16px] font-semibold leading-[1.5] tracking-[-0.08px]">
                        <span className="min-w-0 flex-1 truncate text-foreground">{title}</span>
                        <button
                            type="button"
                            onClick={onSeeAll}
                            disabled={waiting}
                            className="shrink-0 text-point-blue disabled:cursor-default"
                        >
                            {seeAllLabel}
                        </button>
                    </div>
                    <div className="flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {view.photos.map((photo, index) => {
                            const order = pickable ? picked.indexOf(photo.id) + 1 : 0;
                            const isPicked = order > 0;
                            return (
                                <button
                                    key={photo.id}
                                    type="button"
                                    aria-label={(photo.kind === 'video' ? videoLabel : photoLabel)(index + 1)}
                                    aria-pressed={pickable ? isPicked : undefined}
                                    onClick={() => (onToggle ? onToggle(photo.id) : onSelect?.(photo.id))}
                                    disabled={pickable && full && !isPicked}
                                    className="relative size-[90px] shrink-0 overflow-hidden rounded-[12px] bg-muted disabled:cursor-not-allowed"
                                >
                                    <PreviewImage src={photo.src} />
                                    {photo.kind === 'video' && <VideoMark durationMs={photo.durationMs} />}
                                    {isPicked ? (
                                        <>
                                            <span aria-hidden className="absolute inset-0 bg-black/[0.52]" />
                                            <span
                                                aria-hidden
                                                className="absolute right-1 top-[3px] flex size-6 items-center justify-center rounded-full border border-primary bg-primary"
                                            >
                                                <span className="w-[18px] text-center text-[13px] font-semibold leading-[15px] tracking-[-0.455px] text-black">
                                                    {order}
                                                </span>
                                            </span>
                                        </>
                                    ) : (
                                        <span
                                            aria-hidden
                                            className="absolute right-2 top-[7px] size-4 rounded-full border border-tile-ring bg-white/[0.68] backdrop-blur-[3px]"
                                        />
                                    )}
                                </button>
                            );
                        })}
                        {Array.from({ length: view.skeletons }, (_, i) => (
                            <span
                                key={`place-${view.photos.length + i}`}
                                aria-hidden
                                data-recent-placeholder=""
                                className="size-[90px] shrink-0 rounded-[12px] bg-muted motion-safe:animate-pulse"
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
