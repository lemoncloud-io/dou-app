/** Joins the location crumbs of a result row, dropping the ones the cache could not resolve. */
export const formatResultContext = (...crumbs: (string | undefined)[]): string | undefined => {
    const present = crumbs.filter((crumb): crumb is string => !!crumb && crumb.trim().length > 0);
    // Never fall back to raw ids: an unresolvable crumb is simply not shown.
    return present.length > 0 ? present.join(' › ') : undefined;
};
