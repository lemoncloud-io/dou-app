/**
 * Shared react-query mutation keys for session actions.
 *
 * `SWITCH_SITE_MUTATION_KEY` came from the retired web-core `useSiteSwitch`; the winning
 * (socket-notifying) `useSiteSwitch` keys off the same value so the global in-flight observer
 * (`useBackgroundSync`) still pauses during a site switch — the constant had to move with the merge,
 * not die with the loser (설계문서 §동명 훅 병합표).
 */
export const SWITCH_SITE_MUTATION_KEY = ['session', 'switch-site'] as const;

/**
 * Stable key for the cloud-switch mutation. Exported so a global observer (e.g. the background sync
 * runner) can detect an in-flight switch via `useIsMutating` — the mutation's own `isPending` is
 * per-hook-instance and not visible across components.
 *
 * Lived in `useSwitchCloudSession.ts` until now, while its sibling above lived here. Same kind of
 * value in two places leaves no basis for deciding where the next one goes, and this file's title
 * already answered it in the plural.
 */
export const SWITCH_CLOUD_MUTATION_KEY = ['session', 'switch-cloud'] as const;
