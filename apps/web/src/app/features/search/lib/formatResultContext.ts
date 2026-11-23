export const formatResultContext = (...crumbs: (string | undefined)[]): string | undefined => {
    const present = crumbs.filter((crumb): crumb is string => !!crumb && crumb.trim().length > 0);
    return present.length > 0 ? present.join(' › ') : undefined;
};
