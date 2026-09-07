/**
 * Message body styles, shared with desktop-web's composer theme
 * (`editor/editorConfig`) and `MentionNode` so what you type is exactly what
 * readers see.
 *
 * They live in this lib rather than beside `RichText` because the block
 * renderer needs them and the block renderer is what got shared. The dependency
 * therefore points the other way now: `RichText` re-exports these, and the
 * composer keeps importing them from there.
 */
export const MSG_BOLD_CLASS = 'font-semibold';
export const MSG_CODE_INLINE_CLASS = 'rounded bg-well px-1 py-0.5 font-mono text-[0.85em]';
export const MSG_CODE_BLOCK_CLASS =
    'my-1 block overflow-x-auto rounded-md border border-hairline bg-well p-2 font-mono text-[0.85em] leading-relaxed';
export const MSG_QUOTE_CLASS = 'my-0.5 block border-l-2 border-primary/40 pl-2 text-muted-foreground';
export const MSG_MENTION_CLASS = 'rounded bg-primary/10 px-1 font-medium text-primary-ink';
export const MSG_MENTION_SELF_CLASS = 'rounded bg-warning/30 px-1 font-medium text-foreground';
