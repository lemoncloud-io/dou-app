/**
 * Wire contract for the custom-UI PoC channel, shared by main and preload.
 *
 * Both sides are compiled by the same tsconfig, so keeping the channel name and the reply
 * shape here means a rename cannot silently break the other half. Electron-free, so preload
 * pulls nothing from the main bundle.
 *
 * The renderer half of this contract is declared separately in
 * `apps/desktop-web/src/app/shared/utils/electronApi.ts` — Nx blocks app→app imports and a
 * shared lib for three fields would be YAGNI, so the two are kept in sync by hand. Change
 * one, change the other.
 */

/** IPC channel for the custom-UI PoC controls. One channel, so main gates the origin once. */
export const CUSTOM_UI_CHANNEL = 'chatic-custom-ui';

/** Result of every custom-UI request; `error` is set instead of rejecting so the panel can show it. */
export interface CustomUiStatus {
    active: boolean;
    root: string | null;
    error?: string;
}

/** Reply to an `apply` request on a build that does not take custom UI bundles. */
export const CUSTOM_UI_APPLY_REFUSED = 'custom UI bundles can only be applied on the dev channel';

/**
 * Why a request must be refused on this channel, or null to let it through.
 *
 * Only `apply` is channel-gated: it downloads a remote ZIP and swaps the app's UI for it, so a
 * script injected into a trusted page could otherwise replace the UI of a production build for
 * good. `status` is a read and `disable` moves back to the deployed web build — the safe
 * direction — so both stay available everywhere, which is also how a build that once held a
 * bundle can still be reset. Lives here, Electron-free, so the decision is testable without
 * booting the shell.
 */
export const customUiRefusal = (action: unknown, isDevChannel: boolean): string | null =>
    action === 'apply' && !isDevChannel ? CUSTOM_UI_APPLY_REFUSED : null;

/** Where the first window's UI comes from at launch. */
export type CustomUiBoot = { source: 'builtin' } | { source: 'restore' } | { source: 'override'; root: string };

/**
 * What to serve at launch: the bundle a developer pointed `MAIN_VITE_CUSTOM_UI_ROOT` at, the one
 * recorded at last quit, or neither.
 *
 * Off the dev channel it is always neither. Refusing `apply` is not enough on its own: a
 * production install that took a bundle before that refusal existed would still come up on it,
 * and so would a build compiled with the override set. The record and the files are left where
 * they are — only the load is skipped — because deleting them cannot be undone.
 *
 * A set override that cannot be served (no entry point) falls through to the record, so a typo
 * does not also cost the bundle the developer applied.
 */
export const customUiBoot = (
    isDevChannel: boolean,
    override: string | undefined,
    overrideServable: boolean
): CustomUiBoot => {
    if (!isDevChannel) return { source: 'builtin' };
    if (override && overrideServable) return { source: 'override', root: override };
    return { source: 'restore' };
};
