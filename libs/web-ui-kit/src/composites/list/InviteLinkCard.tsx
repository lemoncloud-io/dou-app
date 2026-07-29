import { cn } from '@chatic/lib/utils';

import { ProfileAvatar } from '../../foundations/avatar/ProfileAvatar';

export interface InviteLinkCardProps {
    /** Group/room name shown as the card title. */
    name: string;
    /** Full invite URL shown as the subtitle. */
    url: string;
    /** Room avatar image URL; falls back to the group placeholder glyph. */
    avatarSrc?: string;
    /** Called when the trailing copy action is tapped. */
    onCopy?: () => void;
    /** Visible label of the trailing copy action (host supplies a localized string). */
    copyLabel?: string;
    className?: string;
}

/**
 * Invite-link card — the Figma "초대 링크" screen card (3266-32893): a rounded filled row
 * with the room avatar, its name + full invite URL, and a trailing underlined text link
 * that copies the URL.
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
                onClick={onCopy}
                className="shrink-0 whitespace-nowrap text-[14px] font-medium tracking-[-0.14px] text-point-blue underline"
            >
                {copyLabel}
            </button>
        </div>
    );
};
