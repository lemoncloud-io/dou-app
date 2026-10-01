import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@chatic/ui-kit';

interface InviteCardProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
}

/**
 * Rounded surface card used by the invite accept screen (place / target / validity blocks).
 * Mirrors the Figma glassmorphism: 24px radius, a translucent white fill over the screen's
 * brand-green tint. White alpha + a `dark:` fallback keep the glass read correct in both themes
 * (content colors stay on theme tokens for legibility). No `backdrop-blur` — see
 * `InviteGlassSurface` for why nothing on this screen frosts its backdrop.
 */
export const InviteCard = ({ children, className, ...props }: InviteCardProps) => (
    <div
        className={cn(
            'flex flex-col items-center gap-4 rounded-[24px] border border-white/60 bg-white/45 px-4 py-6 dark:border-white/10 dark:bg-white/10',
            className
        )}
        {...props}
    >
        {children}
    </div>
);
