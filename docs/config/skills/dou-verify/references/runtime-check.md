# Runtime check (dev server, CDP)

For a change no scenario covers yet, or when the behaviour is still being explored. Afterwards, turn what you
did into a scenario ([`dou-e2e`](../../dou-e2e/SKILL.md)) unless the report says why it cannot be one.

1. Start the app with the launch configuration or the command in the root `README.md` (in a worktree, copy
   the `.env` files in first). Open it in the browser pane.
2. Check, in this order: console errors, failed network requests, the page structure (accessibility tree)
   for the changed screen, then a screenshot.
3. Drive the flow with clicks and typing. For state a click cannot reach, call the live modules from the page:
   import the app's own Vite module URL (same `?t=` stamp) and use its repositories or stores.
4. Responsive or theme changes: resize to the mobile preset and back; check dark mode.
5. Capture a screenshot per state you claim, and say in words what each shows.

Limits to state in the report: a browser tab is not the app's WebView. For behaviour behind `isNative()`, use
the in-app shell ([`shell.md`](./shell.md)); for native behaviour, a device ([`device.md`](./device.md)).
