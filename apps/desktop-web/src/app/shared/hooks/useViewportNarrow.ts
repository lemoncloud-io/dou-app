import { useEffect, useState } from 'react';

/**
 * Width below which the three fixed columns (rails + sidebar + message column)
 * no longer fit. Two 68px rails, a 200px sidebar floor and the 420px chat floor
 * add up to 756px, so the shell has to give something up before that.
 */
export const NARROW_SHELL_WIDTH = 860;

/**
 * Width below which the rails cannot stay docked either. Two 68px rails take 136px, and the
 * conversation needs about 300px for its header actions and the composer's format row, so under
 * this the rails ride in the drawer with the sidebar. The window's own floor is wider than this;
 * it is reached by zooming in.
 */
export const COMPACT_SHELL_WIDTH = 480;

const isNarrow = (max: number) => typeof window !== 'undefined' && window.innerWidth < max;

/**
 * True while the window is too narrow to hold the docked sidebar. Browser zoom
 * reports as a smaller viewport, so this is also what carries 200% zoom: at that
 * level a 1280px window is a 640px viewport, where the docked layout used to
 * scroll sideways and clip the header actions.
 */
export const useViewportNarrow = (max: number = NARROW_SHELL_WIDTH) => {
    const [narrow, setNarrow] = useState(() => isNarrow(max));

    useEffect(() => {
        const onResize = () => setNarrow(isNarrow(max));
        onResize();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [max]);

    return narrow;
};
