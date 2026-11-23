# Tuning editor for values words cannot pin down

Colours, easing curves, durations, spacing, sizes and priority orders are hard to agree on in prose. Instead of
guessing and iterating through screenshots, build a throwaway page and let the person set the value.

1. **One HTML artifact**, not a file in the repo. Load the real tokens or the current values from the code as the
   starting point, and say where each one lives (`file:line`).
2. **Live preview** of the thing being tuned with real content: the actual component markup or a faithful copy,
   both themes when colours are involved, the real duration and curve when motion is.
3. **Controls** that match the value: a colour picker plus hex field, a cubic-bezier handle editor with a replay
   button, sliders with numeric fields for spacing and duration, drag-to-reorder for priorities.
4. **Copy as prompt**: one button that copies a short block naming each value and where it goes, e.g.
   `--accent: #2f6f5e (libs/theme/src/tokens.ts:42); room-enter easing: cubic-bezier(.2,.8,.2,1) 220ms`. The
   person pastes it back into the chat; that text is the agreed value.
5. Apply exactly the pasted values, then show the result next to the editor's preview in the verification report.

Use it wherever UI tuning comes up: in a plan, during implementation, or when a review comment says "a bit
lighter" or "less bouncy".
