export type RevealScope = 'tile' | 'att';

const SHOW_ON: Record<RevealScope, string> = {
    tile: '[@media(hover:hover)]:group-hover/tile:opacity-100 [@media(hover:hover)]:group-focus-within/tile:opacity-100',
    att: '[@media(hover:hover)]:group-hover/att:opacity-100 [@media(hover:hover)]:group-focus-within/att:opacity-100',
};

const BASE = 'transition-opacity duration-150 ease-tactile motion-reduce:transition-none';

export const hoverReveal = (scope: RevealScope): string => `${BASE} [@media(hover:hover)]:opacity-0 ${SHOW_ON[scope]}`;
