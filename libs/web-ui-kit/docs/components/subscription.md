# Subscription

- Tones: `accent` lime, `info` point blue, `danger` red, `warning` orange; `ended` is grey. `--warning` is declared by
  `apps/web` but not by the kit's token sheet, so the warning colour carries an inline fallback and `KeyValueRows`
  and `ProductCard` keep it identical.
- `StatusBanner`: the chevron is drawn only when `onClick` is passed, as the visual promise that the card goes
  somewhere. With an `action` the card is a section: the title row carries `onClick` and the pill its own handler,
  since a button cannot nest in a button. Spans are used throughout because the root may be a `<button>`. Dark mode
  falls back to the theme foreground where the design's navy has no token (`brand-ink` stays navy in dark and would
  vanish on the dark card).
- `ProductCard`: only the header row becomes a button with `onClick`, never the whole card, because `children` may carry
  a CTA. The status label is capped so a long one cannot squeeze the name to nothing at a 320px column.
  The caption colour is a token rather than the design's lighter grey, which sits under 3:1 on white.
- `KeyValueRows`: both sides may wrap. A value is capped at 65% of the row, so a long date or price wraps inside its
  column at 320px instead of widening the row; `break-keep` keeps Korean words whole while
  `overflow-wrap: anywhere` still breaks a token longer than the column. `bare` drops the card shell for nesting inside
  another card (`ProductCard` children) so two shadows do not stack. Rows are keyed by `label` unless a `key` is
  given; pass one when two rows share a label.
- `PlanCompareCard`: the paid card is marked three ways from `--primary` (solid header, 24%-alpha hairline border,
  soft glow). Alpha comes from `hsl(var(--primary)/…)` so it tracks the token. `data-tier` lets tests and hosts key off
  the tier without asserting utility classes. `brand-ink` is the same navy in both themes, so it is used only over the
  lime fill; the neutral header follows the theme.
- `PlanBulletList`: `muted` for a free plan's limits, `emphasis` for a paid plan's selling points.
- `SelectableCard` draws the radio exactly like the plan picker in `apps/web` (25px ring, 13px dot) so the two lists
  read as one control. `checked` belongs to the host, which lets one card serve single-pick and multi-pick lists.
- `BenefitItem` leads with a 32px icon slot; `PlanBulletList` rows lead with an 8px dot.
