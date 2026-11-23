import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconAudioWave, IconChevronRight, IconFileGeneric, IconImage, IconLink } from '../../resources/icons';

export type RoomFilesKind = 'media' | 'file' | 'audio' | 'link';

export interface RoomFilesSummaryItem {
    key: RoomFilesKind;
    label: string;
    count: number;
    icon?: React.ReactNode;
    accent?: boolean;
}

export interface RoomFilesSummaryProps {
    items: RoomFilesSummaryItem[];
    onSelect: (key: RoomFilesKind) => void;
    title?: string;
    onSeeAll?: () => void;
    seeAllLabel?: string;
    loading?: boolean;
    className?: string;
}

const DEFAULT_ICON: Record<RoomFilesKind, React.ReactNode> = {
    media: <IconImage size={24} strokeWidth={1.75} />,
    file: <IconFileGeneric size={24} />,
    audio: <IconAudioWave size={24} />,
    link: <IconLink size={24} strokeWidth={1.75} />,
};

export const RoomFilesSummary = ({
    items,
    onSelect,
    title = 'Room files',
    onSeeAll,
    seeAllLabel = 'See all',
    loading = false,
    className,
}: RoomFilesSummaryProps) => (
    <section
        aria-label={title}
        aria-busy={loading || undefined}
        className={cn('flex w-full flex-col gap-4 px-4 py-1', className)}
    >
        <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-medium leading-normal text-description">{title}</h2>
            {onSeeAll && (
                <button
                    type="button"
                    onClick={onSeeAll}
                    className="flex items-center text-[13px] font-medium leading-normal text-description transition-opacity active:opacity-60"
                >
                    {seeAllLabel}
                    <IconChevronRight aria-hidden size={16} strokeWidth={2} className="shrink-0" />
                </button>
            )}
        </div>
        <div className="flex items-start justify-between">
            {items.map(item => (
                <button
                    key={item.key}
                    type="button"
                    onClick={() => onSelect(item.key)}
                    data-kind={item.key}
                    className="group flex w-[76px] shrink-0 flex-col items-center gap-1.5"
                >
                    <span
                        aria-hidden
                        className={cn(
                            'flex size-[52px] items-center justify-center rounded-[16px] transition-transform duration-150 group-active:scale-95 motion-reduce:transition-none',
                            item.accent ? 'bg-brand-ink text-bubble-mine-foreground' : 'bg-action-soft text-foreground'
                        )}
                    >
                        {item.icon ?? DEFAULT_ICON[item.key]}
                    </span>
                    <span className="whitespace-nowrap text-[13px] font-medium leading-normal text-foreground">
                        {item.label}
                    </span>
                    {loading ? (
                        <span
                            aria-hidden
                            data-testid="count-placeholder"
                            className="my-0.5 h-3 w-6 rounded-sm bg-control-idle/60 motion-safe:animate-pulse"
                        />
                    ) : (
                        <span className="text-[12px] leading-normal text-description">{item.count}</span>
                    )}
                </button>
            ))}
        </div>
    </section>
);
