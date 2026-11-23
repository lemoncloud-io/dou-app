import { cn } from '@chatic/ui-kit';

import { ProfileAvatar } from '../../foundations/avatar/ProfileAvatar';

export interface InviteLinkCardProps {
    name: string;
    url: string;
    avatarSrc?: string;
    onCopy?: () => void;
    copyLabel?: string;
    className?: string;
}

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
