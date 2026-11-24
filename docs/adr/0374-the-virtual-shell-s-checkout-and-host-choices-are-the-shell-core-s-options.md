# ADR-0374: The virtual shell's checkout and host choices are the shell core's options

> Status: Accepted · Decided: 2026-11-24 · Implemented: `chore/hybrid-shell-options`
> · Supersedes decision 6 of [ADR-0372](./0372-the-virtual-shell-declares-checkout-and-sandbox-and-sends-store-failures-to-the-web-from-its-own-page.md)
> · Scope: `apps/shell-adapter/src/options.ts` · `apps/shell-adapter/src/shellControls.ts` · `hybrid-shell.config.ts`
> · The module doc is [`apps/shell-adapter/README.md` § Checkout](../../apps/shell-adapter/README.md#checkout)

## Context

ADR-0372 had the adapter add `checkout.set` and `sandbox.set` to `window.virtualShell` and draw its own
notice cards into the shell page, because the shell core had no picker for an app's own choices. The
media and files choices could only be made with an environment variable at start. A person had no way to
change any of them from the panel.

`@lemoncloud/hybrid-shell` 0.11.0 adds both pieces to the core: config `options` (a select or a switch,
each reading and writing one `HandlerContext.store` key, drawn on the panel, relaunching for one that
applies at launch, set by an agent with `virtualShell.options.set`) and `shell.notice` (a line on the
shell page beside the phone, with an optional button). Its adapter checklist asks apps to use them rather
than pickers and cards of their own.

## Decision

1. **Checkout, sandbox, media and files are declared as options**, under the store keys the adapter
   already read (`dou.checkout`, `dou.sandbox`, `dou.media`, `dou.files`), each `applies: 'relaunch'`.
   Each default is the matching `DOU_SHELL_*` variable, so a start with a variable still begins there.
2. **The rules ADR-0372 enforced in `sandbox.set` become option rules.** The sandbox switch is disabled
   off dev with its reason (prod; the local backend has no payment server). The app's picker beside the
   page's transfers — a pair no real host declares — is a greyed choice on either side.
3. **Media and files get an explicit "Not declared" value (`unset`)**, which wins over the variable, so
   the panel can take a choice back.
4. **Notices go through `shell.notice`.** The store notice keeps its **Switch to web** button, which now
   sets the checkout option. The in-app sandbox notice is raised when the virtual store first answers a
   catalog with the sandbox on, since a choice made on the panel never passes through the adapter.
5. **`virtualShell.checkout.set` and `sandbox.set` are removed.** Agents call
   `virtualShell.options.set(id, value)`. `status().checkout` and `status().sandbox` stay, as reads of what
   was declared.

## Consequences

- A person picks every harness choice from the panel; no restart with a variable is needed.
- Scripts that called `checkout.set` or `sandbox.set` fail with "not a function" and must move to
  `options.set`.
- The in-app sandbox notice appears when the subscription screen asks for the catalog, not at the moment
  the switch is flipped.
