import { cn } from '@chatic/lib/utils';

import { IconClose, IconPlus } from '../../resources/icons';

export interface ComposerAttachButtonProps {
    /** Whether the attach panel this button toggles is open — the glyph turns into a close mark. */
    open: boolean;
    onClick: () => void;
    disabled?: boolean;
    /** Accessible name. Host supplies a localized string. */
    label?: string;
    className?: string;
}

/**
 * The round button at the start of the chat composer that opens the attach panel (Figma "Text Area"
 * leading control, `3749:27998`): a 32px circle on the light control surface, `+` while the panel is
 * closed and `×` while it is open, so the same spot closes what it opened.
 *
 * Stateless: `open` belongs to the host, which also owns the panel.
 */
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
