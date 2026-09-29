# ADR-0133: Desktop's text and focus tokens meet AA, and a test holds them there, over the Figma values

> Status: Accepted · Decided: 2026-09-29 · Implemented: PR #508 (`fix/desktop-chat-critique`)
> · Scope: `apps/desktop-web/src/styles.css` · `apps/desktop-web/src/tokenContrast.spec.ts` ·
> `DESIGN.md`
> · The token tables are in [`DESIGN.md`](../../DESIGN.md)

## Context

The desktop palette is taken from Figma. Measured against WCAG 2.x from the HSL values in
`styles.css`, several text and focus pairs were under AA:

- `--destructive` (Figma `#FF3B30`) was 3.58:1 as text on white, and carried white at the same ratio
  as a fill. It is used by every error line and every Delete.
- `--muted-foreground`, the placeholder and the description text were 4.33:1 on the hover tint and
  3.71:1 on the composer box. The dark placeholder was 4.02:1 on a card.
- Focus indicators drew in the fill lime: the composer border about 2.1:1, the sidebar search ring
  about 1.2:1, the viewer's active thumbnail 1.44:1, and the jump highlight 1.17:1.

The same contrast rule had been fixed once before and drifted back, because nothing checked it.

## Decision

1. **Text pairs meet 4.5:1 and focus indicators 3:1, in both themes, even where that moves a value
   off the Figma file.** `--destructive` is one deeper red that passes both as text and as a fill
   carrying white. Muted text is 40% lightness in light mode and 64% in dark.
2. **Every focus indicator uses `--focus-ring`**: the ink lime in light mode, the fill lime in dark.
3. **`src/tokenContrast.spec.ts` parses the `:root` and `.dark` blocks of `styles.css`, resolves
   `var()` aliases, and checks each listed pair.** A token change that breaks a pair fails the test.
   The toast's text and the ink tooltip pair are on the list too.

## Alternatives

- **Keep the Figma red for fills and add a darker text red.** Two reds for one meaning, and the fill
  still failed with white on it.
- **Audit by hand before each release.** That is what had been happening, and the values drifted.

## Consequences

- The red no longer matches Figma `#FF3B30`. A designer comparing the two should read this record.
- The test checks tokens, not components. A component that puts a token on a background outside the
  list, or uses opacity on top of a token, is not covered.
