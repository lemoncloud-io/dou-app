import { useEffect, useState } from 'react';

export const NARROW_SHELL_WIDTH = 860;

export const COMPACT_SHELL_WIDTH = 480;

const isNarrow = (max: number) => typeof window !== 'undefined' && window.innerWidth < max;

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
