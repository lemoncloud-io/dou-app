import { cn } from '@chatic/lib/utils';

import { IconCheckSmall } from '../../resources/icons';

export interface FilterChipProps {
    /** Chip text. */
    label: string;
    /** Optional count drawn after the label (e.g. "멘션 2"); omitted or `undefined` draws none. */
    count?: number;
    /** Whether the chip is on — the filled navy pill. */
    selected?: boolean;
    /**
     * Lead with the small check. The design's "unread only" toggle carries it in both states (grey
     * when off, white when on); the quick-select and tab chips do not.
     */
    check?: boolean;
    /** Fired on tap. The host flips `selected`. */
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
}

/**
 * Filter chip — the outlined pill the notification screens filter and select with: the unread-only
 * toggle (Figma "안 읽은 알림만", 6021:18509 · 6021:20524), quick select (6032:20696) and the find-me
 * sheet's tabs (6027:21740).
 * Off is an outline on the page; on is the navy fill with white text.
 *
 * A toggle, so it reports `aria-pressed`. Stateless and i18n-agnostic.
 */
export const FilterChip = ({
    label,
    count,
    selected = false,
    check = false,
    onClick,
    disabled = false,
    className,
}: FilterChipProps) => (
    <button
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
        className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-[18px] border py-[7px] text-[13px] font-medium leading-4 transition-colors',
            check ? 'pl-2.5 pr-3' : 'px-3',
            selected ? 'border-chip-ink bg-chip-ink text-white' : 'border-chip-border bg-transparent text-tab-idle',
            disabled && 'opacity-50',
            className
        )}
    >
        {check && <IconCheckSmall />}
        <span className="whitespace-nowrap">
            {label}
            {count !== undefined && <span className="ml-1">{count}</span>}
        </span>
    </button>
);
