import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { CheckCheck, ChevronDown, Trash2, X } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';

import { SelectMark } from './NotificationCard';

const ACTION =
    'focus-ring tactile flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-caption font-medium transition-colors ease-tactile disabled:pointer-events-none disabled:opacity-50';

interface SelectionBarProps {
    /** How many of the listed cards are selected. */
    count: number;
    /** `mixed` when some but not all of the listed cards are selected. */
    allState: boolean | 'mixed';
    onToggleAll: () => void;
    onSelectUnread: () => void;
    onClear: () => void;
    /** Marks every item of the open tab read, listed or not. Absent when none is unread. */
    onMarkAllRead?: () => void;
    onMarkRead: () => void;
    onDelete: () => void;
    onClose: () => void;
}

const MENU_ITEM = 'cursor-pointer py-2';

/**
 * The Notifications header while cards are being selected: the select-all box and its options,
 * the count, and what can be done to the selection. It takes focus when it opens: the select
 * button that opened it is gone from the header.
 */
export const SelectionBar = ({
    count,
    allState,
    onToggleAll,
    onSelectUnread,
    onClear,
    onMarkAllRead,
    onMarkRead,
    onDelete,
    onClose,
}: SelectionBarProps) => {
    const { t } = useTranslation();
    const allRef = useRef<HTMLButtonElement>(null);
    useEffect(() => allRef.current?.focus(), []);
    return (
        <div className="flex min-w-0 flex-1 items-center gap-1">
            <button
                ref={allRef}
                type="button"
                role="checkbox"
                aria-checked={allState}
                aria-label={t('inbox.select.all')}
                onClick={onToggleAll}
                className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg"
            >
                <SelectMark state={allState} />
            </button>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={t('inbox.select.options')}
                        className="focus-ring -ml-1 flex h-8 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                    >
                        <ChevronDown size={14} aria-hidden />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 shadow-overlay">
                    <DropdownMenuItem className={MENU_ITEM} onSelect={onSelectUnread}>
                        {t('inbox.select.unread')}
                    </DropdownMenuItem>
                    <DropdownMenuItem className={MENU_ITEM} onSelect={onClear} disabled={count === 0}>
                        {t('inbox.select.none')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className={MENU_ITEM} onSelect={onMarkAllRead} disabled={!onMarkAllRead}>
                        {t('inbox.markAllRead')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <span
                aria-live="polite"
                className="ml-1 truncate text-callout font-semibold tabular-nums text-sidebar-foreground"
            >
                {t('inbox.select.count', { count })}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-0.5">
                <button
                    type="button"
                    disabled={count === 0}
                    onClick={onMarkRead}
                    className={cn(ACTION, 'text-foreground hover:bg-accent')}
                >
                    <CheckCheck size={14} aria-hidden />
                    {t('inbox.select.markRead')}
                </button>
                <button
                    type="button"
                    disabled={count === 0}
                    onClick={onDelete}
                    className={cn(ACTION, 'text-destructive hover:bg-destructive/10')}
                >
                    <Trash2 size={14} aria-hidden />
                    {t('inbox.select.delete')}
                </button>
                <button
                    type="button"
                    aria-label={t('common.close')}
                    onClick={onClose}
                    className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                >
                    <X size={16} aria-hidden />
                </button>
            </span>
        </div>
    );
};
