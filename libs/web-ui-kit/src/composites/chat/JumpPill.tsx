import { cn } from '@chatic/lib/utils';

import { IconAtSign, IconJumpArrow } from '../../resources/icons';

export type JumpPillVariant = 'mention' | 'latest';

export interface JumpPillProps {
    /**
     * `mention` — the white pill with an orange outline, @ and an up arrow: unread mentions of the
     * reader are above the screen (Figma 6002:40133). `latest` — the navy pill with a down arrow:
     * newer messages are below (Figma 6002:41749).
     */
    variant: JumpPillVariant;
    /** Pill text, count included (e.g. a localized "멘션 2", "최신 메시지 25"). */
    label: string;
    /** Fired on tap — the host scrolls to the target. */
    onClick: () => void;
    className?: string;
}

/**
 * Jump pill — the floating shortcut above a chat room's composer that takes the reader to what they
 * have not seen: their unread mentions further up, or the latest messages further down.
 *
 * Positioning is the host's: it sits centred over the message list, above the composer.
 */
export const JumpPill = ({ variant, label, onClick, className }: JumpPillProps) => {
    const isMention = variant === 'mention';
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-[20px] py-2 pl-3 pr-3.5 text-[13px] font-bold leading-4 tracking-[-0.26px] transition-transform active:scale-95',
                isMention
                    ? 'border border-point-orange bg-background text-point-orange shadow-[0_4px_12px_0_rgba(0,0,0,0.12)]'
                    : 'bg-chip-ink text-white shadow-[0_4px_12px_0_rgba(0,0,0,0.15)]',
                className
            )}
        >
            {isMention && <IconAtSign size={16} strokeWidth={2} aria-hidden />}
            <span className="whitespace-nowrap">{label}</span>
            <IconJumpArrow className={cn(!isMention && 'rotate-180')} />
        </button>
    );
};
