/**
 * Leaves the app for a page of the website. `replace` takes the current entry's place in history, so
 * back from the website skips it.
 *
 * A module of its own, not part of `lib/`, which holds pure decisions only — and so the screens' tests
 * can stand in for the navigation.
 */
export const leaveForWeb = (url: string, { replace = false }: { replace?: boolean } = {}): void => {
    if (replace) window.location.replace(url);
    else window.location.assign(url);
};
