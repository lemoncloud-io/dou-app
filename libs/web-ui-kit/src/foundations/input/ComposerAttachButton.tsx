import { cn } from '@chatic/ui-kit';

import { IconClose, IconPlus } from '../../resources/icons';

export interface ComposerAttachButtonProps {
    open: boolean;
    onClick: () => void;
    disabled?: boolean;
    label?: string;
    className?: string;
}

export const ComposerAttachButton = ({
    open,
    onClick,
    disabled = false,
    label = 'Attach',
    className,
}: ComposerAttachButtonProps) => {
    const Glyph = open ? IconClose : IconPlus;
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            aria-expanded={open}
            className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full border border-control-surface bg-control-surface transition-opacity disabled:cursor-not-allowed disabled:opacity-40',
                className
            )}
        >
            <Glyph className="size-[18px] text-brand-ink" strokeWidth={2.5} />
        </button>
    );
};
