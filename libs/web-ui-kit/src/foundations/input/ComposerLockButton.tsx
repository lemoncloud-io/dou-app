import { cn } from '@chatic/ui-kit';

import { IconLock } from '../../resources/icons';

export interface ComposerLockButtonProps {
    onClick: () => void;
    label?: string;
    className?: string;
}

export const ComposerLockButton = ({ onClick, label = 'Unlock input', className }: ComposerLockButtonProps) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full border border-control-surface bg-control-surface',
            className
        )}
    >
        <IconLock className="size-[16px] text-brand-ink" strokeWidth={2.5} />
    </button>
);
