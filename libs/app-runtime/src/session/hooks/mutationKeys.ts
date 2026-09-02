/**
 * Shared react-query mutation keys for session actions.
 *
 * `SWITCH_SITE_MUTATION_KEY` came from the retired web-core `useSiteSwitch`; the winning
 * (socket-notifying) `useSiteSwitch` keys off the same value so the global in-flight observer
 * (`useBackgroundSync`) still pauses during a site switch — the constant had to move with the merge,
 * not die with the loser (설계문서 §동명 훅 병합표).
 */
export const SWITCH_SITE_MUTATION_KEY = ['session', 'switch-site'] as const;
