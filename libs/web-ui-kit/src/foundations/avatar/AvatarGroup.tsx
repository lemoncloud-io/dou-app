import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface AvatarGroupProps {
    /**
     * Pre-built avatar nodes — each a ~24px ringed circle. Rendered overlapping
     * left-to-right, capped at `max`. The host builds these so it owns the
     * "me vs. others" ring treatment (accent ring for self, surface ring for peers).
     */
    avatars: React.ReactNode[];
    /** Total participant count shown after the stack. Defaults to `avatars.length`. */
    count?: number;
    /** Maximum avatars rendered before the count takes over. */
    max?: number;
    className?: string;
}

/**
 * Overlapping avatar stack + participant count — the Figma group-chat header
 * meta. Shows up to `max` avatar nodes overlapped, then the total member count.
 * Purely presentational: the host supplies already-ringed avatar nodes and the
 * count, so an empty `avatars` with `count={1}` renders just the number (the
 * "group with only me" case).
 */
export const AvatarGroup = ({ avatars, count, max = 4, className }: AvatarGroupProps) => {
    const shown = avatars.slice(0, max);
    const total = count ?? avatars.length;

    return (
        <div className={cn('flex items-center gap-1', className)}>
            {shown.length > 0 && (
                <div className="flex items-center">
                    {shown.map((avatar, index) => (
                        // Overlap each subsequent avatar 6px onto the previous one.
                        <span key={index} className={cn('shrink-0', index > 0 && '-ml-1.5')}>
                            {avatar}
                        </span>
                    ))}
                </div>
            )}
            {total > 0 && (
                <span className="text-[14px] font-medium leading-[26px] tracking-[0.07px] text-description">
                    {total}
                </span>
            )}
        </div>
    );
};
