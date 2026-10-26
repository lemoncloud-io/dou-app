/**
 * The form column: on a display wider than a phone, a screen whose job is a few fields and one
 * action keeps them in a centred column instead of stretching an input or a button 800px across
 * an unfolded foldable. A list or a chat room keeps filling the app column — the column is for
 * forms only, and a screen opts in.
 *
 * Three classes, one mechanism:
 *
 * - `FORM_COLUMN` goes on the screen's root and declares `--column-width` from the host's
 *   `--form-width`, and `--column-content`, the same less the 16px gutter a form screen keeps
 *   inside it (`px-4` on its fields, `px-4` on the CTA panel). In a host that declares no form
 *   width both declarations are invalid, neither resolves, and the readers below fall back to the
 *   full width — a desktop host is untouched by construction.
 * - `COLUMN_INSET` goes on the scroll body. It pads each side by half of what the body has beyond
 *   the column, so the content sits in the column while the body — and its scrollbar — stays full
 *   width. Padding rather than a wrapper, so children laid out against the body (`min-h-full`,
 *   `justify-center`) keep working.
 * - `COLUMN_CAP` goes on a docked CTA's button (`mx-auto` or a centring parent alongside). The
 *   panel behind it is a shadowed bar that spans the screen; capped, its shadow would stop
 *   mid-screen, so the bar stays and the button inside it takes `--column-content`, edge to edge
 *   with the fields above it. Capping at the column itself left the button 16px wider than the
 *   fields on each side, because the panel's own gutter is outside the column.
 *
 * Custom properties inherit, which is how a footer CTA learns the width without the screen passing
 * it down.
 */
export const FORM_COLUMN = '[--column-width:var(--form-width)] [--column-content:calc(var(--form-width)_-_2rem)]';

export const COLUMN_INSET = 'px-[max(0px,calc((100%_-_var(--column-width,100%))/2))]';

export const COLUMN_CAP = 'max-w-[var(--column-content,100%)]';
