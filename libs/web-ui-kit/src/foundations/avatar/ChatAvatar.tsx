import { cn } from '@chatic/lib/utils';

import { IconChatBubble } from '../../resources/icons';
import { AvatarShell } from './avatarBase';

const SIZE = { sm: 36, md: 46, lg: 56 } as const;

export interface ChatAvatarProps {
    /** Diameter step (Small 36 / Medium 46 / Large 56). */
    size?: keyof typeof SIZE;
    className?: string;
}

/**
 * Chat placeholder avatar — the design guide's "Chat Profile": a faint navy-tint
 * ringed circle with a speech-bubble glyph, used for chats without a photo.
 */
export const ChatAvatar = ({ size = 'md', className }: ChatAvatarProps) => (
    <AvatarShell px={SIZE[size]} className={cn('bg-brand-ink/5 text-placeholder', className)}>
        <IconChatBubble className="size-[36%]" />
    </AvatarShell>
);
