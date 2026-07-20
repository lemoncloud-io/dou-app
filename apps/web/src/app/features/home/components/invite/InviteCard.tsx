import type { ReactNode } from 'react';

import { cn } from '@chatic/ui-kit';

interface InviteCardProps {
    children: ReactNode;
    className?: string;
}

/**
 * Rounded surface card used by the invite accept screen (place / target / validity blocks).
 * Mirrors the Figma glassmorphism: 24px radius, a translucent frosted fill (`backdrop-blur`) over
 * the screen's brand-green tint. White alpha + a `dark:` fallback keep the frosted read correct in
 * both themes (content colors stay on theme tokens for legibility).
 */
export const InviteCard = ({ children, className }: InviteCardProps) => (
    <div
        className={cn(
            'flex flex-col items-center gap-4 rounded-[24px] border border-white/60 bg-white/45 px-4 py-6 backdrop-blur-[12px] dark:border-white/10 dark:bg-white/10',
            className
        )}
    >
        {children}
    </div>
);
