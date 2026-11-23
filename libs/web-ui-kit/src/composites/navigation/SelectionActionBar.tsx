import { cn } from '@chatic/ui-kit';

export interface SelectionActionBarAction {
    label: string;
    onClick: () => void;
    disabled?: boolean;
}

export interface SelectionActionBarProps {
    secondary: SelectionActionBarAction;
    destructive: SelectionActionBarAction;
    placement?: 'screen' | 'inline';
    className?: string;
}

export const SelectionActionBar = ({
    secondary,
    destructive,
    placement = 'screen',
    className,
}: SelectionActionBarProps) => (
    <div
        data-placement={placement}
        className={cn(
            'flex gap-2 border-t border-input-border bg-background px-4 pt-3',
            placement === 'screen'
                ? 'fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[var(--app-width,430px)]'
                : 'w-full bg-surface pb-3',
            'duration-200 ease-out animate-in fade-in-0 slide-in-from-bottom-4 motion-reduce:animate-none',
            className
        )}
        style={placement === 'screen' ? { paddingBottom: 'calc(var(--safe-bottom, 0px) + 12px)' } : undefined}
    >
        <button
            type="button"
            onClick={secondary.onClick}
            disabled={secondary.disabled}
            className="h-12 flex-1 rounded-xl bg-action-soft text-[15px] font-semibold text-nav-ink transition-[opacity,transform] duration-150 active:scale-[0.98] disabled:opacity-40 motion-reduce:transition-none"
        >
            {secondary.label}
        </button>
        <button
            type="button"
            onClick={destructive.onClick}
            disabled={destructive.disabled}
            className="h-12 flex-1 rounded-xl bg-alert-red text-[15px] font-semibold text-white transition-[opacity,transform] duration-150 active:scale-[0.98] disabled:opacity-40 motion-reduce:transition-none"
        >
            {destructive.label}
        </button>
    </div>
);
