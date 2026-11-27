import { cn } from '@chatic/ui-kit';

import { IconChatBubble } from '@chatic/design-system-assets/icons';
import { AvatarFrame } from './avatarBase';

const SIZE = { sm: 36, md: 46, lg: 56 } as const;

export interface ChatAvatarProps {
    size?: keyof typeof SIZE;
    className?: string;
}

export const ChatAvatar = ({ size = 'md', className }: ChatAvatarProps) => (
    <AvatarFrame
        px={SIZE[size]}
        stroke="border-avatar-ring"
        className={cn('bg-brand-ink/5 text-placeholder', className)}
    >
        <IconChatBubble className="size-[36%]" />
    </AvatarFrame>
);
