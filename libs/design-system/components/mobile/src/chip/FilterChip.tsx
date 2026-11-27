import { cn } from '@chatic/ui-kit';

import { IconCheckSmall } from '@chatic/design-system-assets/icons';

export interface FilterChipProps {
    label: string;
    count?: number;
    selected?: boolean;
    check?: boolean;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
}

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
            'inline-flex shrink-0 items-center gap-1 rounded-[18px] border py-[7px] text-[13px] font-medium leading-4',
            'transition-[background-color,border-color,color,transform] duration-200 active:scale-95 motion-reduce:transition-none',
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
