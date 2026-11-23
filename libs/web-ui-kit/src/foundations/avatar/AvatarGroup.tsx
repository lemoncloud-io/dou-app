import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface AvatarGroupProps {
    avatars: React.ReactNode[];
    count?: number;
    max?: number;
    className?: string;
}

export const AvatarGroup = ({ avatars, count, max = 4, className }: AvatarGroupProps) => {
    const shown = avatars.slice(0, max);
    const total = count ?? avatars.length;

    return (
        <div className={cn('flex items-center gap-1', className)}>
            {shown.length > 0 && (
                <div className="flex items-center">
                    {shown.map((avatar, index) => (
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
