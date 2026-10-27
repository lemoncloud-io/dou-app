import { cn } from '@chatic/lib/utils';

import { IconLock } from '../../resources/icons';

export interface ComposerLockButtonProps {
    onClick: () => void;
    /** Accessible name — what a tap does, not what the button shows. Host supplies a localized string. */
    label?: string;
    className?: string;
}

/**
 * The round button at the start of a locked chat composer, in the attach button's slot and shape: a
 * padlock that lifts the lock. It stands where the attach button was, because a locked composer takes
 * no photos either, and so the one thing the composer can still do sits where the eye already looks.
 *
 * Stateless: whether the composer is locked, and what lifting it means, belong to the host.
 */
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
