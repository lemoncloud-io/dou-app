import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconAudioWave, IconChevronRight, IconFileGeneric, IconImage, IconLink } from '../../resources/icons';

export type RoomFilesKind = 'media' | 'file' | 'audio' | 'link';

export interface RoomFilesSummaryItem {
    /** Which list the cell opens. Also picks the default glyph. */
    key: RoomFilesKind;
    /** Cell label (e.g. a localized "Photos·Videos"). */
    label: string;
    /** How many the room holds. Ignored while `loading`. */
    count: number;
    /** A 24px glyph in place of the kind's default. */
    icon?: React.ReactNode;
    /**
     * Draws the tile navy with a white glyph instead of the soft grey ground — the design marks the
     * audio cell this way. Which cell, if any, is the host's call.
     */
    accent?: boolean;
}

export interface RoomFilesSummaryProps {
    /** The four cells, left to right. */
    items: RoomFilesSummaryItem[];
    /** A cell was pressed. */
    onSelect: (key: RoomFilesKind) => void;
    /** The section's title. */
    title?: string;
    /** Opens the file list on its first tab. Omitted, the "See all" link is not drawn. */
    onSeeAll?: () => void;
    seeAllLabel?: string;
    /**
     * The counts are not known yet: each count is a placeholder bar rather than `0`, which would say
     * the room has none.
     */
    loading?: boolean;
    className?: string;
}

const DEFAULT_ICON: Record<RoomFilesKind, React.ReactNode> = {
    media: <IconImage size={24} strokeWidth={1.75} />,
    file: <IconFileGeneric size={24} />,
    audio: <IconAudioWave size={24} />,
    link: <IconLink size={24} strokeWidth={1.75} />,
};

/**
 * The "room files" block of a room's settings (Figma "방 설정 · 대화방 파일" 6072:23272, on screen
 * 6067:22063): a grey 13px title with an optional "See all ›" on the right, then four 76px cells
 * spread across the row — a 52px rounded tile with the kind's glyph, the label, and the count in grey.
 *
 * Stateless: the counts arrive as props and each cell reports its key.
 */
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
