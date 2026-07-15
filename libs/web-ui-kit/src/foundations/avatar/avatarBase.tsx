import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface AvatarShellProps {
    /** Diameter in pixels. */
    px: number;
    /** Tone/glyph classes (background + text color) layered onto the ring shell. */
    className?: string;
    children?: React.ReactNode;
}

/** Shared ringed-circle shell for the placeholder avatars (Chat/Place). */
export const AVATAR_SHELL = 'inline-flex shrink-0 items-center justify-center rounded-full border border-avatar-ring';

/**
 * Internal base for the placeholder avatars — a fixed-size ringed circle that
 * centers a glyph. ChatAvatar/PlaceAvatar layer their own fill/text tone and
 * glyph on top, so the shell + sizing live in one place.
 */
export const AvatarShell = ({ px, className, children }: AvatarShellProps) => (
    <span className={cn(AVATAR_SHELL, className)} style={{ width: px, height: px }}>
        {children}
    </span>
);
