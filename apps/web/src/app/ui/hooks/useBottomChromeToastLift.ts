import { useLayoutEffect, useState } from 'react';

import { useToastLift } from '@chatic/ui-kit/components/ui/toaster';

const rootVar = (name: string): number =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;

/**
 * Keeps the snackbar above a bar docked to the bottom edge — the chat composer, a docked CTA.
 *
 * `height` is the bar's border-box height, which already carries its own bottom padding for the
 * keyboard or home indicator. The snackbar's offset starts at that same `max(safe-bottom,
 * keyboard-height)`, so only the part of the bar above it is asked for here; otherwise the two would
 * be counted twice and the snackbar would float a keyboard's height too high.
 */
export const useBottomChromeToastLift = (height: number | null) => {
    // Re-read the inset when the bar resizes: the keyboard moves the bar and its height together.
    const [inset, setInset] = useState(0);
    useLayoutEffect(() => {
        setInset(Math.max(rootVar('--safe-bottom'), rootVar('--keyboard-height')));
    }, [height]);

    useToastLift(height ? Math.max(0, height - inset) : null);
};
