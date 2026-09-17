/**
 * One header contract for every pane beside each other in the shell: same
 * height, same rule. The conversation's title carries the heavier type, since
 * it names what the screen is about; a side panel's title is one step down.
 * They used to be 68px and 56px tall, with the side panels outranking the
 * conversation.
 */
export const PANE_HEADER = 'flex h-14 shrink-0 items-center justify-between gap-2 border-b border-hairline';
export const PANE_TITLE = 'truncate text-title text-foreground';
export const PANEL_TITLE = 'truncate text-heading text-foreground';
