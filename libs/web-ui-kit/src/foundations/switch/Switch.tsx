import { cn } from '@chatic/ui-kit';

export interface SwitchProps {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
    label?: string;
    className?: string;
}

export const Switch = ({
    checked = false,
    onCheckedChange,
    disabled = false,
    label = 'toggle',
    className,
}: SwitchProps) => {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onCheckedChange?.(!checked)}
            className={cn(
                'inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50',
                checked ? 'bg-primary' : 'bg-input-border',
                className
            )}
        >
            <span
                className={cn(
                    'size-5 rounded-full bg-white shadow-sm transition-transform',
                    checked ? 'translate-x-5' : 'translate-x-0'
                )}
            />
        </button>
    );
};
