/**
 * Whether a runtime call failed because the installed app predates the method. Where the app owns the
 * session, a page newer than the app can name a method the app's runtime does not have yet; the app
 * answers `RUNTIME_NOT_AVAILABLE` rather than running and failing it, and a screen reads that as "not
 * in this app yet" and leaves the feature out instead of showing it broken.
 */
export const isRuntimeNotAvailable = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'RUNTIME_NOT_AVAILABLE';
