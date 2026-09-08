import { cn } from '@chatic/lib/utils';

/**
 * An icon-only control in the rail or over the preview.
 *
 * One string because the two toolbars are the same control at two sizes; the
 * caller supplies `h-*`/`w-*` and any hover tint (destructive ones go red).
 */
export const ICON_CONTROL = cn(
    'focus-ring tactile flex items-center justify-center rounded',
    'text-muted-foreground transition-colors ease-tactile hover:bg-accent disabled:opacity-30'
);
