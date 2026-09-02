/**
 * Browser network probes — the one place this lib touches `navigator`.
 *
 * Guarded rather than assumed: `@chatic/http` also runs under plain node (jest without jsdom), and a
 * missing global must read as "cannot tell", never as offline — an offline verdict SUPPRESSES failure
 * attribution, so a wrong one would silently disable it in every non-browser runtime.
 */
export const isBrowserOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;
