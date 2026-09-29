/**
 * The hover groups a control can hang off. Each one is a Tailwind named group
 * (`group/<scope>`) on the element that owns the controls.
 */
export type RevealScope = 'tile' | 'att' | 'mention' | 'saved';

// Whole class strings, not built from the scope name: Tailwind only generates the
// classes it can read in the source.
const SHOW_ON: Record<RevealScope, string> = {
    tile: '[@media(hover:hover)]:group-hover/tile:opacity-100 [@media(hover:hover)]:group-focus-within/tile:opacity-100',
    att: '[@media(hover:hover)]:group-hover/att:opacity-100 [@media(hover:hover)]:group-focus-within/att:opacity-100',
    mention:
        '[@media(hover:hover)]:group-hover/mention:opacity-100 [@media(hover:hover)]:group-focus-within/mention:opacity-100',
    saved: '[@media(hover:hover)]:group-hover/saved:opacity-100 [@media(hover:hover)]:group-focus-within/saved:opacity-100',
};

const BASE = 'transition-opacity duration-150 ease-tactile motion-reduce:transition-none';

/**
 * Classes for a control that surfaces on hover (an image's save bar, the tray's
 * remove "×", a Mentions or Saved row's actions). The message toolbar keeps its own
 * rules: it also slides, and it is made inert while hidden.
 *
 * Every one of these was written by hand, and each forgot a different case. One rule
 * now covers them all:
 * - hidden only where the device can hover; on touch nothing would ever show it;
 * - shown while the pointer is over its group, or while focus is anywhere inside
 *   the group, so a keyboard user sees what they tab into.
 */
export const hoverReveal = (scope: RevealScope): string => `${BASE} [@media(hover:hover)]:opacity-0 ${SHOW_ON[scope]}`;
