import { cn } from '@chatic/lib/utils';

import { ProfileAvatar } from '../../foundations/avatar/ProfileAvatar';
import { IconLink } from '../../resources/icons';

export interface InviteLinkCardProps {
    /** Group/room name shown as the card title. */
    name: string;
    /** Full invite URL shown as the subtitle. */
    url: string;
    /** Room avatar image URL; falls back to the group placeholder glyph. */
    avatarSrc?: string;
    /** Called when the trailing link/copy button is tapped. */
    onCopy?: () => void;
    /** Accessible label for the copy button (host supplies a localized string). */
    copyLabel?: string;
    className?: string;
}

/**
 * Invite-link card — the Figma "초대 링크" screen card: a rounded filled row with
 * the room avatar, its name + full invite URL, and a trailing circular button that
 * copies the link.
 */
export const InviteLinkCard = ({
    name,
    url,
    avatarSrc,
    onCopy,
    copyLabel = 'Copy link',
    className,
}: InviteLinkCardProps) => {
    return (
        <div className={cn('flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3', className)}>
            <ProfileAvatar src={avatarSrc} size={44} glyph="group" />
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[16px] font-semibold tracking-[-0.32px] text-foreground">{name}</span>
                <span className="truncate text-[14px] font-medium tracking-[-0.28px] text-description">{url}</span>
            </div>
            <button
                type="button"
                aria-label={copyLabel}
                onClick={onCopy}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background text-foreground"
            >
                <IconLink className="size-5" strokeWidth={2} />
            </button>
        </div>
    );
};
