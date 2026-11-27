import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface AvatarFrameProps {
    px: number;
    stroke?: string | null;
    className?: string;
    children?: React.ReactNode;
}

export const AvatarFrame = ({ px, stroke = 'border-avatar-stroke', className, children }: AvatarFrameProps) => (
    <span
        className={cn(
            'inline-grid shrink-0 place-items-center overflow-hidden rounded-full [&>*]:col-start-1 [&>*]:row-start-1',
            className
        )}
        style={{ width: px, height: px }}
    >
        {children}
        {stroke && (
            <span
                aria-hidden="true"
                data-avatar-stroke=""
                className={cn('pointer-events-none size-full rounded-full border', stroke)}
            />
        )}
    </span>
);
